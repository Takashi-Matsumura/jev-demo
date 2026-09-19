"use client";

import { useCallback, useRef, useState } from "react";
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

type CommandResponse = {
  plan: CommandPlan;
  usage: { input_tokens: number; output_tokens: number };
};

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
  const [usage, setUsage] = useState<CommandResponse["usage"] | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [flashing, setFlashing] = useState<string[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setLoading(true);
      setError(null);
      setPlan(null);
      setPending([]);
      const startedAt = performance.now();

      try {
        const res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed, state }),
        });
        const data = (await res.json()) as CommandResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        setElapsed(Math.round(performance.now() - startedAt));
        setUsage(data.usage);
        setPlan(data.plan);
        applyItems(data.plan.items.filter((i) => i.verdict === "apply"));
        setPending(data.plan.items.filter((i) => i.verdict === "confirm"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
      } finally {
        setLoading(false);
      }
    },
    [applyItems, loading, state],
  );

  const resolvePending = (item: PlanItem, accept: boolean) => {
    if (accept) applyItems([item]);
    setPending((prev) => prev.filter((p) => p.controlId !== item.controlId));
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          TypeSafe AI · jev-latest · System One
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          自然言語で動くコントロールパネル
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          指示を 1 回送ると、コントロール 1 つにつき「言及されたか」と「どの値にすべきか」の
          2 問が jev に並列で投げられます。jev は文章を一切生成せず、確率つきの型つき答えだけを返し、
          実際にスイッチを動かすのはこのページのコードです。
        </p>
      </header>

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
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="やりたいことを日本語で入力（例: 寝るから暗くして）"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            disabled={loading || command.trim() === ""}
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
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

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

      {plan && <PlanReport plan={plan} usage={usage} elapsed={elapsed} />}
    </div>
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

function PlanReport({
  plan,
  usage,
  elapsed,
}: {
  plan: CommandPlan;
  usage: CommandResponse["usage"] | null;
  elapsed: number | null;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">jev の判定</h2>
        <p className="font-mono text-xs text-zinc-500">
          {plan.items.length + plan.untouched.length} controls ×2 questions
          {elapsed !== null && ` · ${elapsed}ms`}
          {usage && ` · ${usage.input_tokens}in/${usage.output_tokens}out`}
        </p>
      </div>

      {plan.items.length === 0 && (
        <p className="text-sm text-zinc-500">
          どのコントロールにも言及がないと判定されました。
        </p>
      )}

      {plan.items.map((item) => (
        <div key={item.controlId} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
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
          <div className="flex flex-col gap-0.5">
            {item.breakdown.map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-[11px] text-zinc-500">
                  {row.label}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <span
                    className="block h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                    style={{ width: `${Math.round(row.probability * 100)}%` }}
                  />
                </span>
                <span className="w-10 text-right font-mono text-[10px] text-zinc-400">
                  {(row.probability * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
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
    verdict === "apply" ? "適用" : verdict === "confirm" ? "要確認" : "変更なし";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {label}
    </span>
  );
}
