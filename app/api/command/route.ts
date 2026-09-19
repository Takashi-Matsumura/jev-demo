import { CONTROLS, formatValue, type PanelState } from "@/lib/controls";
import { askJev, JevError } from "@/lib/jev";
import { buildPlan, buildQuestions } from "@/lib/plan";

export type CommandRequest = {
  command: string;
  state: PanelState;
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

  try {
    const response = await askJev(
      {
        // 現在の状態も渡す。「もう少し明るく」のような相対的な指示は
        // 今の値を知らないと解釈できない。
        command,
        current_settings: CONTROLS.map((c) => ({
          control: c.label,
          value: formatValue(c, state[c.id] ?? c.initial),
        })),
      },
      buildQuestions(),
    );

    return Response.json({
      plan: buildPlan(response.answers, state),
      usage: response.usage,
      answers: response.answers,
    });
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
