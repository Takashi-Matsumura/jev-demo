"use client";

import type { AutoplayControls, AutoplayPhase } from "@/lib/use-autoplay";
import type { Scenario } from "@/lib/scenarios";

const PHASE_LABELS: Record<AutoplayPhase, string> = {
  idle: "停止中",
  resetting: "初期状態に戻しています",
  typing: "入力中",
  sending: "jev に問い合わせ中",
  confirming: "確認待ち（まもなく自動で承認します）",
  holding: "結果を表示中",
};

export default function AutoplayBar({
  scenarios,
  scenario,
  onScenarioChange,
  autoplay,
}: {
  scenarios: Scenario[];
  scenario: Scenario;
  onScenarioChange: (id: string) => void;
  autoplay: AutoplayControls;
}) {
  const { running, paused, stepIndex, phase, remaining, totalWait } = autoplay;
  const step = stepIndex >= 0 ? scenario.steps[stepIndex] : null;
  const progress =
    totalWait > 0 ? 1 - Math.min(remaining, totalWait) / totalWait : 0;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={`h-2 w-2 rounded-full ${
              running
                ? paused
                  ? "bg-amber-500"
                  : "animate-pulse bg-emerald-500"
                : "bg-zinc-300 dark:bg-zinc-700"
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

      {step && (
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
