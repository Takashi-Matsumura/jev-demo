"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTROLS,
  INITIAL_STATE,
  formatValue,
  scoreToValue,
  type Control,
  type ControlValue,
  type PanelState,
} from "@/lib/controls";
import type { CommandPlan, PlanItem } from "@/lib/plan";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import type { CommandResult } from "@/app/api/command/route";
import { SCENARIOS } from "@/lib/scenarios";
import { useAutoplay } from "@/lib/use-autoplay";
import JevConsole, { type ConsoleEntry } from "./jev-console";
import AutoplayBar from "./autoplay-bar";

const EXAMPLES = [
  "そろそろ寝るから照明落として通知も止めて",
  "ちょっと寒い。エアコンつけて暖かめに",
  "映画を見るからいい感じにして",
  "作業に戻る。明るさは最大で",
];

export default function ControlPanel() {
  const [state, setState] = useState<PanelState>(INITIAL_STATE);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  const [pending, setPending] = useState<PlanItem[]>([]);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<string[]>([]);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // オートプレイのループから呼ぶため、送信時は最新の状態を ref 越しに読む
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const busyRef = useRef(false);

  const applyItems = useCallback((items: PlanItem[]) => {
    if (items.length === 0) return;
    setState((prev) => {
      const next = { ...prev };
      for (const item of items) next[item.controlId] = item.to;
      return next;
    });
    setFlashing(items.map((i) => i.controlId));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashing([]), 1200);
  }, []);

  const send = useCallback(
    async (text: string): Promise<CommandResult | null> => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return null;

      busyRef.current = true;
      setLoading(true);
      setInFlight(trimmed);
      setError(null);
      setPlan(null);
      setPending([]);

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const at = new Date().toLocaleTimeString("ja-JP", { hour12: false });

      try {
        const res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed, state: stateRef.current }),
        });
        const data = (await res.json()) as CommandResult & { error?: string };

        if (!res.ok) {
          const message = data.error ?? `HTTP ${res.status}`;
          setEntries((prev) => [
            { id, at, command: trimmed, ok: false, error: message },
            ...prev,
          ]);
          throw new Error(message);
        }

        setEntries((prev) => [
          { id, at, command: trimmed, ok: true, exchange: data.exchange },
          ...prev,
        ]);
        setPlan(data.plan);
        applyItems(data.plan.items.filter((i) => i.verdict === "apply"));
        setPending(data.plan.items.filter((i) => i.verdict === "confirm"));
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
        return null;
      } finally {
        busyRef.current = false;
        setLoading(false);
        setInFlight(null);
      }
    },
    [applyItems],
  );

  // 発話が確定したらそのまま jev に投げる
  const speech = useSpeechRecognition({
    onFinal: (transcript) => {
      if (!transcript) return;
      setCommand(transcript);
      void send(transcript);
    },
  });

  const resolvePending = (item: PlanItem, accept: boolean) => {
    if (accept) applyItems([item]);
    setPending((prev) => prev.filter((p) => p.controlId !== item.controlId));
  };

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setPlan(null);
    setPending([]);
    setError(null);
    setEntries([]);
  }, []);

  /** オートプレイ中は確認を待たずに自動で承認する。 */
  const acceptPending = useCallback(
    (items: PlanItem[]) => {
      applyItems(items);
      setPending([]);
    },
    [applyItems],
  );

  const autoplay = useAutoplay({
    scenario,
    send,
    acceptPending,
    reset,
    setCommandText: setCommand,
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          TypeSafe AI · jev-latest · System One
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          自然言語で動くコントロールパネル
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          指示を 1 回送ると、コントロール 1
          つにつき「言及されたか」と「どの値にすべきか」の 2 問が jev
          に並列で投げられます。jev
          は文章を一切生成せず、確率つきの型つき答えだけを返し、
          実際にスイッチを動かすのはこのページのコードです。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-6">
          <AutoplayBar
            scenarios={SCENARIOS}
            scenario={scenario}
            onScenarioChange={setScenarioId}
            autoplay={autoplay}
            lastError={error}
          />

          <section className="grid gap-4 sm:grid-cols-2">
            {CONTROLS.map((control) => (
              <ControlCard
                key={control.id}
                control={control}
                value={state[control.id]}
                flashing={flashing.includes(control.id)}
                onChange={(next) =>
                  setState((prev) => ({ ...prev, [control.id]: next }))
                }
              />
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(command);
              }}
              className="flex gap-2"
            >
              <input
                value={
                  speech.listening && speech.interim ? speech.interim : command
                }
                onChange={(e) => setCommand(e.target.value)}
                readOnly={speech.listening}
                placeholder={
                  speech.listening
                    ? "聞き取り中…"
                    : "やりたいことを日本語で入力（例: 寝るから暗くして）"
                }
                className={`flex-1 rounded-lg border bg-white px-4 py-3 text-sm outline-none dark:bg-zinc-950 ${
                  speech.listening
                    ? "border-red-400 text-zinc-500"
                    : "border-zinc-300 focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                }`}
              />
              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.toggle}
                  aria-pressed={speech.listening}
                  aria-label={
                    speech.listening ? "音声入力を停止" : "音声入力を開始"
                  }
                  title={speech.listening ? "停止" : "音声で入力"}
                  className={`flex w-12 items-center justify-center rounded-lg border transition-colors ${
                    speech.listening
                      ? "animate-pulse border-red-500 bg-red-500 text-white"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
                  }`}
                >
                  <MicIcon />
                </button>
              )}
              <button
                type="submit"
                disabled={loading || autoplay.running || command.trim() === ""}
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {loading ? "判定中…" : "実行"}
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setCommand(example);
                    void send(example);
                  }}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>

          {speech.error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {speech.error}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {pending.length > 0 && (
            <section className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                確信度が低いので確認します
              </h2>
              {pending.map((item) => (
                <div
                  key={item.controlId}
                  className="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <span>
                    <strong>{item.label}</strong> を {item.fromLabel} →{" "}
                    {item.toLabel} に変更しますか？
                    <span className="ml-2 font-mono text-xs text-amber-800 dark:text-amber-300">
                      confidence {item.confidence.toFixed(2)}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => resolvePending(item, true)}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      適用
                    </button>
                    <button
                      type="button"
                      onClick={() => resolvePending(item, false)}
                      className="rounded-md border border-zinc-400 px-3 py-1.5 text-xs dark:border-zinc-600"
                    >
                      やめる
                    </button>
                  </span>
                </div>
              ))}
            </section>
          )}

          {plan && <PlanReport plan={plan} />}
        </div>

        <JevConsole entries={entries} inFlight={inFlight} />
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function ControlCard({
  control,
  value,
  flashing,
  onChange,
}: {
  control: Control;
  value: ControlValue;
  flashing: boolean;
  onChange: (next: ControlValue) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors duration-500 ${
        flashing
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{control.label}</span>
        <span className="font-mono text-xs text-zinc-500">
          {formatValue(control, value)}
        </span>
      </div>

      {control.kind === "toggle" && (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={control.label}
          onClick={() => onChange(!value)}
          className={`h-7 w-12 rounded-full p-0.5 transition-colors ${
            value ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
          }`}
        >
          <span
            className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      )}

      {control.kind === "score" && (
        <div className="flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={control.levels.length - 1}
            step={0.01}
            value={Number(value)}
            aria-label={control.label}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between font-mono text-[10px] text-zinc-400">
            <span>{control.min}</span>
            <span>{scoreToValue(control, Number(value)).toFixed(1)}</span>
            <span>{control.max}</span>
          </div>
        </div>
      )}

      {control.kind === "choice" && (
        <div className="flex flex-wrap gap-1.5">
          {control.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                value === option.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanReport({ plan }: { plan: CommandPlan }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">アプリの判断</h2>
        <p className="font-mono text-xs text-zinc-500">
          確率の内訳は右のコンソールへ
        </p>
      </div>

      {plan.items.length === 0 && (
        <p className="text-sm text-zinc-500">
          どのコントロールにも言及がないと判定されました。
        </p>
      )}

      {plan.items.map((item) => (
        <div
          key={item.controlId}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="font-medium">{item.label}</span>
          <span className="font-mono text-xs text-zinc-500">
            {item.fromLabel} → {item.toLabel}
          </span>
          <Badge verdict={item.verdict} />
          <span className="font-mono text-[10px] text-zinc-400">
            mentioned {item.mentioned.toFixed(2)} · confidence{" "}
            {item.confidence.toFixed(2)}
          </span>
        </div>
      ))}

      {plan.untouched.length > 0 && (
        <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          言及なしと判定され、現状維持:{" "}
          {plan.untouched
            .map((u) => `${u.label} (${u.mentioned.toFixed(2)})`)
            .join(" / ")}
        </p>
      )}
    </section>
  );
}

function Badge({ verdict }: { verdict: PlanItem["verdict"] }) {
  const style =
    verdict === "apply"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : verdict === "confirm"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  const label =
    verdict === "apply"
      ? "適用"
      : verdict === "confirm"
        ? "要確認"
        : "変更なし";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {label}
    </span>
  );
}
