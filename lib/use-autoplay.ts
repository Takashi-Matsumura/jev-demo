"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandResult } from "@/app/api/command/route";
import type { PlanItem } from "./plan";
import type { Scenario } from "./scenarios";

export type AutoplayPhase =
  | "idle"
  | "resetting"
  | "typing"
  | "sending"
  | "retrying"
  | "suspended"
  | "confirming"
  | "holding";

/** 1 文字あたりのタイプ速度（人が打っているように見せるため） */
const TYPING_MS = 45;
/** hold の指定がない手順の表示時間 */
const DEFAULT_HOLD = 4500;
/** 確認バーを見せてから自動承認するまでの時間 */
const CONFIRM_HOLD = 3200;
/** 初期状態に戻してから 1 手目に入るまでの間 */
const RESET_HOLD = 1400;
/** 進捗の更新間隔。実際の刻みはブラウザのタイマ制限で伸びることがある */
const TICK_MS = 100;
/** 数回までは短い間隔で同じ手順をやり直す */
const RETRY_HOLD = 3000;
/** 連続失敗がこの回数に達したら、先へ進めず復帰を待つ */
const SUSPEND_AFTER = 3;
/** 復帰待ちの基準間隔。失敗が続くほど倍にしていく */
const RETRY_BASE = 5000;
const RETRY_MAX = 60000;

const CANCELLED = Symbol("cancelled");
type Token = { cancelled: boolean };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AutoplayControls = {
  running: boolean;
  paused: boolean;
  loop: boolean;
  /** 実行中の手順。停止中は -1 */
  stepIndex: number;
  phase: AutoplayPhase;
  /** 待ち時間の残り（ミリ秒）。進捗バー用 */
  remaining: number;
  totalWait: number;
  /** 連続して失敗した回数。成功すると 0 に戻る */
  failures: number;
  /** 連続失敗により、先へ進めず復帰を待っている状態か */
  suspended: boolean;
  start: () => void;
  stop: () => void;
  togglePause: () => void;
  skip: () => void;
  setLoop: (value: boolean) => void;
};

export function useAutoplay({
  scenario,
  send,
  acceptPending,
  reset,
  setCommandText,
}: {
  scenario: Scenario;
  /** 指示を送り、結果を返す。エラー時は null */
  send: (text: string) => Promise<CommandResult | null>;
  /** 確認待ちの項目を自動で承認する */
  acceptPending: (items: PlanItem[]) => void;
  /** パネルを初期状態に戻す */
  reset: () => void;
  /** 入力欄の表示を差し替える（タイプ風アニメーション用） */
  setCommandText: (text: string) => void;
}): AutoplayControls {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(true);
  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState<AutoplayPhase>("idle");
  const [remaining, setRemaining] = useState(0);
  const [totalWait, setTotalWait] = useState(0);
  const [failures, setFailures] = useState(0);
  const [suspended, setSuspended] = useState(false);

  const tokenRef = useRef<Token | null>(null);
  const pausedRef = useRef(false);
  const loopRef = useRef(loop);
  const skipRef = useRef(false);
  const failuresRef = useRef(0);

  // ハンドラは毎回変わるので、ループ側は ref 越しに最新を呼ぶ
  const deps = useRef({ scenario, send, acceptPending, reset, setCommandText });
  useEffect(() => {
    deps.current = { scenario, send, acceptPending, reset, setCommandText };
  });
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  /**
   * 一時停止・スキップ・停止を見ながら待つ。
   *
   * 残り時間は「経過した実時間」で減らす。タイマの刻み幅で減らすと、
   * バックグラウンドタブで setTimeout が 1 秒に制限されたときに
   * 待ち時間が何倍にも伸びてしまう。
   */
  const wait = useCallback(async (ms: number, token: Token) => {
    setTotalWait(ms);
    let left = ms;
    let lastAt = Date.now();
    setRemaining(left);

    while (left > 0) {
      await delay(TICK_MS);
      if (token.cancelled) throw CANCELLED;

      const now = Date.now();
      const elapsed = now - lastAt;
      lastAt = now;

      if (skipRef.current) {
        skipRef.current = false;
        break;
      }
      if (pausedRef.current) continue;

      left -= elapsed;
      setRemaining(Math.max(0, left));
    }

    setRemaining(0);
    setTotalWait(0);
  }, []);

  /** 人が打っているように 1 文字ずつ出す。こちらも実時間で進める。 */
  const typeOut = useCallback(async (text: string, token: Token) => {
    let shown = 0;
    let elapsed = 0;
    let lastAt = Date.now();

    while (shown < text.length) {
      await delay(TYPING_MS);
      if (token.cancelled) throw CANCELLED;

      const now = Date.now();
      const step = now - lastAt;
      lastAt = now;
      if (pausedRef.current) continue;

      elapsed += step;
      const target = Math.min(
        text.length,
        Math.max(shown + 1, Math.floor(elapsed / TYPING_MS)),
      );
      if (target > shown) {
        shown = target;
        deps.current.setCommandText(text.slice(0, shown));
      }
    }
  }, []);

  /**
   * 指示を送る。失敗したら同じ手順をやり直す。
   *
   * 連続失敗が続く間は先へ進めず、間隔を広げながら復帰を待つ。
   * 無人で流しているときに、通信断や API キーの失効で
   * シナリオだけが空回りし続けるのを避けるため。
   */
  const sendWithRecovery = useCallback(
    async (command: string, token: Token): Promise<CommandResult | null> => {
      for (;;) {
        setPhase("sending");
        const result = await deps.current.send(command);
        if (token.cancelled) throw CANCELLED;

        if (result) {
          failuresRef.current = 0;
          setFailures(0);
          setSuspended(false);
          return result;
        }

        failuresRef.current += 1;
        setFailures(failuresRef.current);

        if (failuresRef.current >= SUSPEND_AFTER) {
          setSuspended(true);
          setPhase("suspended");
          const backoff = Math.min(
            RETRY_BASE * 2 ** (failuresRef.current - SUSPEND_AFTER),
            RETRY_MAX,
          );
          await wait(backoff, token);
          continue;
        }

        setPhase("retrying");
        await wait(RETRY_HOLD, token);
      }
    },
    [wait],
  );

  const stop = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelled = true;
    tokenRef.current = null;
    pausedRef.current = false;
    skipRef.current = false;
    failuresRef.current = 0;
    setRunning(false);
    setPaused(false);
    setFailures(0);
    setSuspended(false);
    setStepIndex(-1);
    setPhase("idle");
    setRemaining(0);
    setTotalWait(0);
    deps.current.setCommandText("");
  }, []);

  const start = useCallback(() => {
    if (tokenRef.current) return;
    const token: Token = { cancelled: false };
    tokenRef.current = token;
    pausedRef.current = false;
    setPaused(false);
    setRunning(true);

    void (async () => {
      try {
        do {
          setPhase("resetting");
          setStepIndex(-1);
          deps.current.reset();
          deps.current.setCommandText("");
          await wait(RESET_HOLD, token);

          const steps = deps.current.scenario.steps;
          for (let i = 0; i < steps.length; i += 1) {
            setStepIndex(i);
            setPhase("typing");
            await typeOut(steps[i].command, token);

            const result = await sendWithRecovery(steps[i].command, token);
            if (token.cancelled) throw CANCELLED;

            const confirms =
              result?.plan.items.filter((item) => item.verdict === "confirm") ??
              [];
            if (confirms.length > 0) {
              // 確認バーを見せてから承認する。ここが見せ場なので飛ばさない。
              setPhase("confirming");
              await wait(CONFIRM_HOLD, token);
              deps.current.acceptPending(confirms);
            }

            setPhase("holding");
            await wait(steps[i].hold ?? DEFAULT_HOLD, token);
          }
        } while (loopRef.current && !token.cancelled);

        if (!token.cancelled) stop();
      } catch (e) {
        if (e !== CANCELLED) throw e;
      }
    })();
  }, [sendWithRecovery, stop, typeOut, wait]);

  const togglePause = useCallback(() => {
    if (!tokenRef.current) return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  const skip = useCallback(() => {
    if (!tokenRef.current) return;
    skipRef.current = true;
  }, []);

  // 画面を離れたら必ず止める
  useEffect(() => {
    return () => {
      if (tokenRef.current) tokenRef.current.cancelled = true;
      tokenRef.current = null;
    };
  }, []);

  return {
    running,
    paused,
    loop,
    stepIndex,
    phase,
    remaining,
    totalWait,
    failures,
    suspended,
    start,
    stop,
    togglePause,
    skip,
    setLoop,
  };
}
