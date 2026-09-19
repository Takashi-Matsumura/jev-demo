"use client";

import { useState } from "react";
import type { CommandResult } from "@/app/api/command/route";
import type { JevAnswer, JevQuestion } from "@/lib/jev";

export type ConsoleEntry = {
  id: string;
  /** 送信時刻 HH:MM:SS */
  at: string;
  command: string;
} & ({ ok: true; result: CommandResult } | { ok: false; error: string });

type Tab = "pairs" | "request" | "response";

const TABS: { id: Tab; label: string }[] = [
  { id: "pairs", label: "質問と回答" },
  { id: "request", label: "送信 JSON" },
  { id: "response", label: "受信 JSON" },
];

export default function JevConsole({
  entries,
  inFlight,
}: {
  entries: ConsoleEntry[];
  /** 送信中のコマンド。なければ null */
  inFlight: string | null;
}) {
  const [tab, setTab] = useState<Tab>("pairs");
  // 新しいやり取りが来たら、そちらを開く。ユーザーが別のものを開いた場合だけ上書きする。
  const [override, setOverride] = useState<{ head: string; id: string } | null>(
    null,
  );
  const head = entries[0]?.id;
  const activeId = override && override.head === head ? override.id : head;

  return (
    <aside className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold">jev コンソール</h2>
          <p className="font-mono text-[10px] text-zinc-500">
            POST api.typesafe.ai/v1/systemone
          </p>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {entries.length} calls
        </span>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              tab === t.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {inFlight && (
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            送信中: {inFlight}
          </div>
        )}

        {entries.length === 0 && !inFlight && (
          <p className="px-4 py-8 text-center text-xs leading-5 text-zinc-500">
            指示を送ると、jev に投げた質問と
            <br />
            返ってきた答えがここに出ます。
          </p>
        )}

        {entries.map((entry) => (
          <EntryBlock
            key={entry.id}
            entry={entry}
            tab={tab}
            open={entry.id === activeId}
            onToggle={() =>
              setOverride({
                head: head ?? "",
                id: entry.id === activeId ? "" : entry.id,
              })
            }
          />
        ))}
      </div>
    </aside>
  );
}

function EntryBlock({
  entry,
  tab,
  open,
  onToggle,
}: {
  entry: ConsoleEntry;
  tab: Tab;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <span className="mt-0.5 font-mono text-[10px] text-zinc-400">
          {entry.at}
        </span>
        <span className="flex-1 text-xs leading-5">{entry.command}</span>
        <span className="mt-0.5 font-mono text-[10px] text-zinc-400">
          {entry.ok ? `${entry.result.elapsedMs}ms` : "error"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {!entry.ok ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {entry.error}
            </p>
          ) : (
            <>
              <Meter result={entry.result} />
              {tab === "pairs" && <Pairs result={entry.result} />}
              {tab === "request" && (
                <Json
                  value={{
                    endpoint: entry.result.request.endpoint,
                    model: entry.result.request.model,
                    state: entry.result.request.state,
                    questions: entry.result.request.questions,
                  }}
                />
              )}
              {tab === "response" && <Json value={entry.result.response} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Meter({ result }: { result: CommandResult }) {
  const count = Object.keys(result.request.questions).length;
  return (
    <dl className="mb-3 grid grid-cols-3 gap-2 rounded-md bg-white px-3 py-2 font-mono text-[10px] dark:bg-zinc-900">
      <div>
        <dt className="text-zinc-400">questions</dt>
        <dd>{count}</dd>
      </div>
      <div>
        <dt className="text-zinc-400">latency</dt>
        <dd>{result.elapsedMs}ms</dd>
      </div>
      <div>
        <dt className="text-zinc-400">tokens</dt>
        <dd>
          {result.response.usage.input_tokens} /{" "}
          {result.response.usage.output_tokens}
        </dd>
      </div>
    </dl>
  );
}

/** 質問とその答えを 1 対 1 で並べる。jev の挙動を追うのが目的のビュー。 */
function Pairs({ result }: { result: CommandResult }) {
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(result.request.questions).map(([key, question]) => (
        <Pair
          key={key}
          name={key}
          question={question}
          answer={result.response.answers[key]}
        />
      ))}
    </div>
  );
}

function Pair({
  name,
  question,
  answer,
}: {
  name: string;
  question: JevQuestion;
  answer: JevAnswer | undefined;
}) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <div className="rounded-md bg-white p-3 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px]">{name}</span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500 dark:bg-zinc-800">
          {question.type}
        </span>
      </div>

      <p className="mt-1 text-[11px] leading-5 text-zinc-600 dark:text-zinc-400">
        {question.instructions}
      </p>

      <button
        type="button"
        onClick={() => setShowCriteria((v) => !v)}
        className="mt-1 font-mono text-[10px] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {showCriteria ? "− criteria" : "+ criteria"}
      </button>
      {showCriteria && <Criteria question={question} />}

      <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
        {answer ? (
          <Answer answer={answer} />
        ) : (
          <span className="text-[11px] text-zinc-400">答えなし</span>
        )}
      </div>
    </div>
  );
}

function Criteria({ question }: { question: JevQuestion }) {
  if (question.type === "score") {
    return (
      <ol className="mt-1 list-inside list-decimal font-mono text-[10px] leading-5 text-zinc-500">
        {question.criteria.map((level, i) => (
          <li key={level} value={i}>
            {level}
          </li>
        ))}
      </ol>
    );
  }

  const entries = Object.entries(question.criteria ?? {});
  if (entries.length === 0) {
    return (
      <p className="mt-1 font-mono text-[10px] text-zinc-400">（指定なし）</p>
    );
  }
  return (
    <dl className="mt-1 flex flex-col gap-0.5 font-mono text-[10px] leading-5 text-zinc-500">
      {entries.map(([key, description]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 text-zinc-400">{key}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  );
}

function Answer({ answer }: { answer: JevAnswer }) {
  if (answer.type === "noul") {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold">
          {answer.noul.toFixed(2)}
        </span>
        <Bar ratio={answer.noul} />
        <span className="font-mono text-[10px] text-zinc-400">P(true)</span>
      </div>
    );
  }

  if (answer.type === "choice") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold">
            {answer.choice}
          </span>
          <span className="font-mono text-[10px] text-zinc-400">
            confidence {answer.confidence.toFixed(2)}
          </span>
        </div>
        {Object.entries(answer.probabilities).map(([option, probability]) => (
          <Row
            key={option}
            label={option}
            probability={probability}
            highlight={option === answer.choice}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs font-semibold">
          {answer.score.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-zinc-400">
          confidence {answer.confidence.toFixed(2)}
        </span>
      </div>
      {Object.entries(answer.probabilities).map(([level, probability]) => (
        <Row
          key={level}
          label={`${level} · ${answer.legend?.[level] ?? ""}`}
          probability={probability}
        />
      ))}
    </div>
  );
}

function Row({
  label,
  probability,
  highlight,
}: {
  label: string;
  probability: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-32 shrink-0 truncate text-[10px] ${
          highlight ? "font-medium" : "text-zinc-500"
        }`}
      >
        {label}
      </span>
      <Bar ratio={probability} />
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-zinc-400">
        {(probability * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <span
        className="block h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </span>
  );
}

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(text)}
        className="absolute right-2 top-2 rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:text-zinc-100"
      >
        copy
      </button>
      <pre className="max-h-[60vh] overflow-auto rounded-md bg-white p-3 font-mono text-[10px] leading-4 dark:bg-zinc-900">
        {text}
      </pre>
    </div>
  );
}
