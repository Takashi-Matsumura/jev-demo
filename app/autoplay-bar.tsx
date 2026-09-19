"use client";

import type { AutoplayControls, AutoplayPhase } from "@/lib/use-autoplay";
import type { Scenario } from "@/lib/scenarios";

const PHASE_LABELS: Record<AutoplayPhase, string> = {
  idle: "停止中",
  resetting: "初期状態に戻しています",
  typing: "入力中",
  sending: "jev に問い合わせ中",
  retrying: "失敗したのでやり直します",
  suspended: "中断中（復帰を待っています）",
  confirming: "確認待ち（まもなく自動で承認します）",
  holding: "結果を表示中",
};

export default function AutoplayBar({
  scenarios,
  scenario,
  onScenarioChange,
  autoplay,
  lastError,
}: {
  scenarios: Scenario[];
  scenario: Scenario;
  onScenarioChange: (id: string) => void;
  autoplay: AutoplayControls;
  /** 直近の送信エラー。中断の理由として見せる */
  lastError: string | null;
}) {
  const {
    running,
    paused,
    stepIndex,
    phase,
    remaining,
    totalWait,
    failures,
    suspended,
  } = autoplay;
  const step = stepIndex >= 0 ? scenario.steps[stepIndex] : null;
  const progress =
    totalWait > 0 ? 1 - Math.min(remaining, totalWait) / totalWait : 0;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={`h-2 w-2 rounded-full ${
              !running
                ? "bg-zinc-300 dark:bg-zinc-700"
                : suspended
                  ? "animate-pulse bg-red-500"
                  : paused
                    ? "bg-amber-500"
                    : "animate-pulse bg-emerald-500"
            }`}
          />
          オートプレイ
        </span>

        <select
          value={scenario.id}
          disabled={running}
          onChange={(e) => onScenarioChange(e.target.value)}
          aria-label="シナリオ"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}（{s.steps.length} 手順）
            </option>
          ))}
        </select>

        <div className="flex gap-1.5">
          {!running ? (
            <button
              type="button"
              onClick={autoplay.start}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              ▶ 再生
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={autoplay.togglePause}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                {paused ? "▶ 再開" : "⏸ 一時停止"}
              </button>
              <button
                type="button"
                onClick={autoplay.skip}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                ⏭ 次へ
              </button>
              <button
                type="button"
                onClick={autoplay.stop}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                ⏹ 停止
              </button>
            </>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={autoplay.loop}
            onChange={(e) => autoplay.setLoop(e.target.checked)}
            className="accent-zinc-900 dark:accent-zinc-100"
          />
          繰り返す
        </label>

        <span className="ml-auto font-mono text-[10px] text-zinc-400">
          {running
            ? `${Math.max(stepIndex + 1, 1)} / ${scenario.steps.length} · ${PHASE_LABELS[phase]}`
            : scenario.description}
        </span>
      </div>

      {suspended && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">
              jev への問い合わせが {failures} 回続けて失敗しました
            </p>
            <p className="mt-0.5 text-xs leading-5 text-red-800 dark:text-red-300">
              シナリオを進めずに、同じ手順で再試行しています
              {remaining > 0 && `（あと ${Math.ceil(remaining / 1000)} 秒）`}。
              {lastError && (
                <span className="ml-1 font-mono text-[10px] opacity-80">
                  {lastError}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={autoplay.skip}
            className="rounded-md border border-red-400 px-3 py-1.5 text-xs text-red-900 dark:border-red-800 dark:text-red-200"
          >
            今すぐ再試行
          </button>
        </div>
      )}

      {step && !suspended && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
          <p className="text-sm leading-6">{step.note}</p>
          <span className="h-0.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <span
              className="block h-full rounded-full bg-zinc-900 transition-[width] duration-100 ease-linear dark:bg-zinc-100"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        </div>
      )}
    </section>
  );
}
