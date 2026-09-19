import { askJev, JevError, type JevExchange } from "@/lib/jev";
import {
  buildScreeningQuestions,
  summarize,
  type ScreeningSummary,
} from "@/lib/screening";

export type ScreenRequest = {
  fileName: string;
  chunks: string[];
};

export type ScreenResult = {
  fileName: string;
  summary: ScreeningSummary;
  /** チャンクごとのやり取り。コンソールにそのまま出す */
  exchanges: JevExchange[];
  totalElapsedMs: number;
};

const MAX_CHUNKS = 16;
const MAX_CHUNK_LENGTH = 4000;
/** jev への同時リクエスト数 */
const CONCURRENCY = 4;

export async function POST(request: Request) {
  let body: ScreenRequest;
  try {
    body = (await request.json()) as ScreenRequest;
  } catch {
    return Response.json({ error: "JSON を解析できません" }, { status: 400 });
  }

  const chunks = (body?.chunks ?? [])
    .filter((c) => typeof c === "string" && c.trim() !== "")
    .slice(0, MAX_CHUNKS)
    .map((c) => c.slice(0, MAX_CHUNK_LENGTH));

  if (chunks.length === 0) {
    return Response.json(
      { error: "PDF からテキストを取り出せませんでした" },
      { status: 400 },
    );
  }

  const questions = buildScreeningQuestions();

  try {
    const startedAt = performance.now();
    const exchanges = await mapWithConcurrency(
      chunks,
      CONCURRENCY,
      (chunk, i) =>
        askJev({ part: `${i + 1}/${chunks.length}`, text: chunk }, questions),
    );
    const totalElapsedMs = Math.round(performance.now() - startedAt);

    const result: ScreenResult = {
      fileName: body.fileName ?? "",
      summary: summarize(exchanges.map((e) => e.response.answers)),
      exchanges,
      totalElapsedMs,
    };
    return Response.json(result);
  } catch (error) {
    if (error instanceof JevError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 },
    );
  }
}

/** 同時実行数を抑えつつ、入力順に結果を並べる。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await task(items[index], index);
      }
    })(),
  );

  await Promise.all(workers);
  return results;
}
