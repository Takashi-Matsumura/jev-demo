"use client";

import { useCallback, useRef, useState } from "react";
import type { ScreenResult } from "@/app/api/screen/route";
import { chunkText } from "@/lib/screening";
import JevConsole, { type ConsoleEntry } from "../jev-console";

type Phase = "idle" | "extracting" | "screening";

type Extracted = {
  fileName: string;
  pages: number;
  characters: number;
  chunks: string[];
};

const VERDICTS = {
  block: {
    label: "外部の AI に渡さないでください",
    detail: "そのまま渡すと問題になる情報が含まれています。",
    className:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
  },
  review: {
    label: "確認してください",
    detail: "個人情報または社内限りの情報が含まれている可能性があります。",
    className:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  },
  allow: {
    label: "渡して問題ありません",
    detail: "対象のカテゴリはどれも検出されませんでした。",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  },
} as const;

export default function PdfScreener() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setExtracted(null);
    setEntries([]);

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError("PDF ファイルを渡してください");
      return;
    }

    // 1. 抽出はブラウザ内で完結させる。PDF そのものはどこにも送らない。
    setPhase("extracting");
    let info: Extracted;
    try {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(
        new Uint8Array(await file.arrayBuffer()),
      );
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        setPhase("idle");
        setError(
          "テキストを取り出せませんでした。画像だけの PDF の可能性があります。",
        );
        return;
      }
      info = {
        fileName: file.name,
        pages: totalPages,
        characters: text.replace(/\s+/g, "").length,
        chunks,
      };
      setExtracted(info);
    } catch (e) {
      setPhase("idle");
      setError(
        `PDF を読めませんでした: ${e instanceof Error ? e.message : "不明なエラー"}`,
      );
      return;
    }

    // 2. 抽出したテキストだけを jev に投げる。
    setPhase("screening");
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: info.fileName,
          chunks: info.chunks,
        }),
      });
      const data = (await res.json()) as ScreenResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const at = new Date().toLocaleTimeString("ja-JP", { hour12: false });
      setResult(data);
      setEntries(
        data.exchanges.map((exchange, i) => ({
          id: `${Date.now()}-${i}`,
          at,
          command: `チャンク ${i + 1}/${data.exchanges.length}`,
          ok: true,
          exchange,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setPhase("idle");
    }
  }, []);

  const busy = phase !== "idle";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          TypeSafe AI · jev-latest · System One
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          PDF 事前チェック
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          社外の AI に PDF を渡す前に、個人情報や機密情報が含まれていないかを
          jev で判定します。jev は文章を生成しないので、判定結果に本文が
          出てくることはありません。返るのはカテゴリごとの確率だけです。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              dragging
                ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            <PdfIcon />
            <p className="text-sm font-medium">
              {busy
                ? phase === "extracting"
                  ? "テキストを抽出しています…"
                  : "jev で判定しています…"
                : "PDF をここにドロップ"}
            </p>
            <p className="text-xs text-zinc-500">
              アップロードはしません。判定してから送るかどうかを決められます。
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-xs hover:border-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-zinc-100"
            >
              ファイルを選ぶ
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <p className="rounded-lg border border-zinc-200 px-4 py-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800">
            <strong className="text-zinc-700 dark:text-zinc-300">
              データの扱い
            </strong>
            ：PDF
            の解析はブラウザ内で行われ、ファイル自体はサーバに送られません。
            ただし
            <strong>
              抽出したテキストは判定のため TypeSafe の API に送信されます
            </strong>
            。 外部に一切出せない文書に使う場合は、jev 互換のローカルモデルに
            向き先を変えてください（差し替えは <code>lib/jev.ts</code> の 1
            箇所です）。
          </p>

          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {extracted && (
            <dl className="grid grid-cols-4 gap-2 rounded-lg border border-zinc-200 px-4 py-3 font-mono text-[11px] dark:border-zinc-800">
              <Stat label="file" value={extracted.fileName} truncate />
              <Stat label="pages" value={String(extracted.pages)} />
              <Stat label="chars" value={String(extracted.characters)} />
              <Stat label="chunks" value={String(extracted.chunks.length)} />
            </dl>
          )}

          {result && <Report result={result} />}
        </div>

        <JevConsole
          entries={entries}
          inFlight={phase === "screening" ? "PDF のチャンクを判定中" : null}
        />
      </div>
    </div>
  );
}

function Report({ result }: { result: ScreenResult }) {
  const { summary } = result;
  const verdict = VERDICTS[summary.verdict];
  const detected = summary.findings.filter((f) => f.probability >= 0.5);

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-xl border px-5 py-4 ${verdict.className}`}>
        <p className="text-base font-semibold">{verdict.label}</p>
        <p className="mt-1 text-xs leading-5">{verdict.detail}</p>
        <p className="mt-2 font-mono text-[10px] opacity-70">
          {summary.chunkCount} chunks ×{" "}
          {result.exchanges.length > 0
            ? Object.keys(result.exchanges[0].request.questions).length
            : 0}{" "}
          questions · {result.totalElapsedMs}ms
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="文書の種類">
          {summary.docType.label}
          <Confidence value={summary.docType.confidence} />
        </Card>
        <Card label="jev の総合判断">
          {summary.jevRecommendation.label}
          <Confidence value={summary.jevRecommendation.confidence} />
        </Card>
        <Card label="リスクレベル">
          <span className="font-mono">{summary.risk.score.toFixed(2)} / 4</span>
          <span className="mt-1 block text-[10px] leading-4 text-zinc-500">
            {summary.risk.level}
          </span>
        </Card>
      </div>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold">
          カテゴリごとの検出確率
          <span className="ml-2 font-mono text-[10px] font-normal text-zinc-500">
            全チャンクの最大値
          </span>
        </h2>
        <div className="flex flex-col gap-1.5">
          {summary.findings.map((finding) => (
            <div key={finding.id} className="flex items-center gap-2">
              <span className="flex w-40 shrink-0 items-center gap-1 text-[11px]">
                {finding.label}
                {finding.severe && (
                  <span
                    title="1 件でも検出されたら送信を止めるカテゴリ"
                    className="rounded bg-red-100 px-1 text-[9px] text-red-700 dark:bg-red-950 dark:text-red-300"
                  >
                    重大
                  </span>
                )}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <span
                  className={`block h-full rounded-full ${
                    finding.probability >= 0.8
                      ? "bg-red-500"
                      : finding.probability >= 0.5
                        ? "bg-amber-500"
                        : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                  style={{ width: `${Math.round(finding.probability * 100)}%` }}
                />
              </span>
              <span className="w-9 shrink-0 text-right font-mono text-[10px] text-zinc-400">
                {finding.probability.toFixed(2)}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-zinc-400">
                {finding.probability >= 0.5
                  ? `chunk ${finding.chunkIndex + 1}`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      {detected.length > 0 && (
        <Excerpt result={result} chunkIndex={detected[0].chunkIndex} />
      )}
    </div>
  );
}

/** どの本文が引っかかったのかを、こちらの画面でだけ確認できるようにする。 */
function Excerpt({
  result,
  chunkIndex,
}: {
  result: ScreenResult;
  chunkIndex: number;
}) {
  const state = result.exchanges[chunkIndex]?.request.state as
    { text?: string } | undefined;
  if (!state?.text) return null;

  return (
    <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold">
        もっとも確率が高かった箇所（チャンク {chunkIndex + 1}）
      </summary>
      <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-[11px] leading-5 dark:bg-zinc-900">
        {state.text}
      </p>
    </details>
  );
}

function Card({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="font-mono text-[10px] text-zinc-400">{label}</p>
      <div className="mt-0.5 text-xs">{children}</div>
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  return (
    <span className="mt-1 block font-mono text-[10px] text-zinc-400">
      confidence {value.toFixed(2)}
    </span>
  );
}

function Stat({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className={truncate ? "min-w-0" : undefined}>
      <dt className="text-zinc-400">{label}</dt>
      <dd className={truncate ? "truncate" : undefined}>{value}</dd>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-zinc-400"
      aria-hidden="true"
    >
      <path d="M14 3v5h5" />
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M12 18v-6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  );
}
