import { CONTROLS, formatValue, type PanelState } from "@/lib/controls";
import {
  askJev,
  ENDPOINT,
  JevError,
  MODEL,
  type JevQuestion,
  type JevResponse,
} from "@/lib/jev";
import { buildPlan, buildQuestions, type CommandPlan } from "@/lib/plan";

export type CommandRequest = {
  command: string;
  state: PanelState;
};

/** コンソールに出すため、jev に送った内容をそのまま返す。 */
export type CommandResult = {
  plan: CommandPlan;
  request: {
    endpoint: string;
    model: string;
    state: unknown;
    questions: Record<string, JevQuestion>;
  };
  response: JevResponse;
  /** サーバ側で計測した jev の応答時間（ミリ秒） */
  elapsedMs: number;
};

export async function POST(request: Request) {
  let body: CommandRequest;
  try {
    body = (await request.json()) as CommandRequest;
  } catch {
    return Response.json({ error: "JSON を解析できません" }, { status: 400 });
  }

  const command = body?.command?.trim();
  if (!command) {
    return Response.json({ error: "指示が空です" }, { status: 400 });
  }

  const state = body.state ?? {};

  // 現在の状態も渡す。「もう少し明るく」のような相対的な指示は
  // 今の値を知らないと解釈できない。
  const jevState = {
    command,
    current_settings: CONTROLS.map((c) => ({
      control: c.label,
      value: formatValue(c, state[c.id] ?? c.initial),
    })),
  };
  const questions = buildQuestions();

  try {
    const startedAt = performance.now();
    const response = await askJev(jevState, questions);
    const elapsedMs = Math.round(performance.now() - startedAt);

    const result: CommandResult = {
      plan: buildPlan(response.answers, state),
      request: { endpoint: ENDPOINT, model: MODEL, state: jevState, questions },
      response,
      elapsedMs,
    };
    return Response.json(result);
  } catch (error) {
    if (error instanceof JevError) {
      return Response.json(
        {
          error: error.message,
          request: {
            endpoint: ENDPOINT,
            model: MODEL,
            state: jevState,
            questions,
          },
        },
        { status: error.status },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 },
    );
  }
}
