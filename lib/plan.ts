/**
 * 「自然言語の指示 → どのコントロールをどう動かすか」の変換。
 *
 * コントロール 1 つにつき質問は 2 問。
 *   <id>_mentioned … そもそもこのコントロールに言及しているか（noul）
 *   <id>_value     … どの値にすべきか（noul / score / choice）
 * 全部まとめて 1 回のコールで並列評価させる。
 * 言及されていないコントロールは、値の答えが返っていても無視する
 * ＝ 指示に無い設定が勝手に動かない。
 */

import {
  CONTROLS,
  formatValue,
  type Control,
  type ControlValue,
  type PanelState,
} from "./controls";
import type {
  ChoiceAnswer,
  JevAnswer,
  JevQuestion,
  NoulAnswer,
  ScoreAnswer,
} from "./jev";

/** これ未満の言及確率なら、そのコントロールには触れない。 */
const MENTION_THRESHOLD = 0.5;
/** 言及の確からしさがこれ未満なら、自動適用せず確認を挟む。 */
const MENTION_CONFIDENT = 0.7;
/** 値の confidence がこれ未満なら、自動適用せず確認を挟む。 */
const VALUE_CONFIDENT = 0.5;

export type PlanItem = {
  controlId: string;
  label: string;
  kind: Control["kind"];
  /** 言及確率 P(true) */
  mentioned: number;
  /** 値そのものの確からしさ 0〜1 */
  confidence: number;
  from: ControlValue;
  to: ControlValue;
  fromLabel: string;
  toLabel: string;
  /** 自動適用するか、ユーザーの確認を待つか、何もしないか */
  verdict: "apply" | "confirm" | "unchanged";
  /** 確率分布の内訳（UI に出して根拠を見せる） */
  breakdown: { label: string; probability: number }[];
};

export type CommandPlan = {
  items: PlanItem[];
  /** 言及ありと判定されなかったコントロール */
  untouched: { controlId: string; label: string; mentioned: number }[];
};

export function buildQuestions(): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};

  for (const control of CONTROLS) {
    questions[`${control.id}_mentioned`] = {
      type: "noul",
      instructions: `ユーザーの指示は「${control.label}」（${control.mentionHint}）の変更を求めているか`,
      criteria: {
        true: `${control.mentionHint} に当たる指示が含まれている。言い回しが違っても、意味として求めていれば true`,
        false: `そのような指示は含まれておらず、この設定は現状のままでよい`,
      },
    };

    switch (control.kind) {
      case "toggle":
        questions[`${control.id}_value`] = {
          type: "noul",
          instructions: control.ask,
          criteria: { true: control.trueMeans, false: control.falseMeans },
        };
        break;
      case "score":
        questions[`${control.id}_value`] = {
          type: "score",
          instructions: control.ask,
          criteria: control.levels,
        };
        break;
      case "choice":
        questions[`${control.id}_value`] = {
          type: "choice",
          instructions: control.ask,
          criteria: Object.fromEntries(
            control.options.map((o) => [o.id, o.hint]),
          ),
        };
        break;
    }
  }

  return questions;
}

/** noul の 0.5 からの距離を 0〜1 の確からしさに直す。 */
function noulConfidence(p: number): number {
  return Math.abs(p - 0.5) * 2;
}

export function buildPlan(
  answers: Record<string, JevAnswer>,
  state: PanelState,
): CommandPlan {
  const items: PlanItem[] = [];
  const untouched: CommandPlan["untouched"] = [];

  for (const control of CONTROLS) {
    const mention = answers[`${control.id}_mentioned`] as
      | NoulAnswer
      | undefined;
    const value = answers[`${control.id}_value`];
    if (!mention || mention.type !== "noul" || !value) continue;

    if (mention.noul < MENTION_THRESHOLD) {
      untouched.push({
        controlId: control.id,
        label: control.label,
        mentioned: mention.noul,
      });
      continue;
    }

    const resolved = resolve(control, value);
    if (!resolved) continue;

    const from = state[control.id] ?? control.initial;
    const changed = !isSameValue(control, from, resolved.to);
    const confident =
      resolved.confidence >= VALUE_CONFIDENT &&
      mention.noul >= MENTION_CONFIDENT;

    items.push({
      controlId: control.id,
      label: control.label,
      kind: control.kind,
      mentioned: mention.noul,
      confidence: resolved.confidence,
      from,
      to: resolved.to,
      fromLabel: formatValue(control, from),
      toLabel: formatValue(control, resolved.to),
      verdict: !changed ? "unchanged" : confident ? "apply" : "confirm",
      breakdown: resolved.breakdown,
    });
  }

  return { items, untouched };
}

type Resolved = {
  to: ControlValue;
  confidence: number;
  breakdown: PlanItem["breakdown"];
};

function resolve(control: Control, answer: JevAnswer): Resolved | null {
  if (control.kind === "toggle" && answer.type === "noul") {
    const p = (answer as NoulAnswer).noul;
    return {
      to: p >= 0.5,
      confidence: noulConfidence(p),
      breakdown: [
        { label: "ON", probability: p },
        { label: "OFF", probability: 1 - p },
      ],
    };
  }

  if (control.kind === "score" && answer.type === "score") {
    const a = answer as ScoreAnswer;
    return {
      to: a.score,
      confidence: a.confidence,
      breakdown: Object.entries(a.probabilities).map(([level, probability]) => ({
        label: a.legend?.[level] ?? control.levels[Number(level)] ?? level,
        probability,
      })),
    };
  }

  if (control.kind === "choice" && answer.type === "choice") {
    const a = answer as ChoiceAnswer;
    return {
      to: a.choice,
      confidence: a.confidence,
      breakdown: Object.entries(a.probabilities).map(([id, probability]) => ({
        label: control.options.find((o) => o.id === id)?.label ?? id,
        probability,
      })),
    };
  }

  return null;
}

/** score は連続値なので、わずかな差は「変更なし」とみなす。 */
function isSameValue(
  control: Control,
  a: ControlValue,
  b: ControlValue,
): boolean {
  if (control.kind === "score") {
    return Math.abs(Number(a) - Number(b)) < 0.05;
  }
  return a === b;
}
