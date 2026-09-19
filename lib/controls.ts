/**
 * コントロールパネルの定義。UI の描画と jev への質問生成の両方が
 * ここだけを参照する（画面に無いものを jev が選ぶことはない）。
 */

/** どのコントロールにも共通する、言及判定（noul）のための情報。 */
type ControlBase = {
  id: string;
  label: string;
  /**
   * 「このコントロールに言及しているか」を尋ねるときの説明。
   * ラベル名だけだと、ユーザーがその単語を使わない限り言及なしと判定されてしまう。
   */
  mentionHint: string;
};

export type ToggleControl = ControlBase & {
  kind: "toggle";
  /** ON にすべきかを尋ねる noul の instructions */
  ask: string;
  trueMeans: string;
  falseMeans: string;
  initial: boolean;
};

export type ScoreControl = ControlBase & {
  kind: "score";
  ask: string;
  /** 順序つきレベル。jev はこの 0〜(length-1) 上の小数位置を返す */
  levels: string[];
  /** レベル 0 と最終レベルに対応する実値（表示用にマップする） */
  min: number;
  max: number;
  unit: string;
  initial: number;
};

export type ChoiceControl = ControlBase & {
  kind: "choice";
  ask: string;
  options: { id: string; label: string; hint: string }[];
  initial: string;
};

export type Control = ToggleControl | ScoreControl | ChoiceControl;

export const CONTROLS: Control[] = [
  {
    id: "lights",
    mentionHint: "部屋の明かりを点ける・消すこと",
    kind: "toggle",
    label: "照明",
    ask: "部屋の照明を点けた状態にすべきか",
    trueMeans: "照明を点ける・明るくすることを望んでいる",
    falseMeans: "照明を消す・暗くすることを望んでいる",
    initial: true,
  },
  {
    id: "aircon",
    mentionHint: "冷暖房や空調の運転。暑い・寒いという訴えも含む",
    kind: "toggle",
    label: "エアコン",
    ask: "エアコンを運転状態にすべきか",
    trueMeans: "エアコンを動かすことを望んでいる",
    falseMeans: "エアコンを止めることを望んでいる",
    initial: false,
  },
  {
    id: "humidifier",
    mentionHint: "加湿や湿度、空気の乾燥に関すること",
    kind: "toggle",
    label: "加湿器",
    ask: "加湿器を運転状態にすべきか",
    trueMeans: "加湿器を動かすことを望んでいる",
    falseMeans: "加湿器を止めることを望んでいる",
    initial: false,
  },
  {
    id: "quiet",
    mentionHint: "通知・アラート・着信を止めること。静かにしたい、邪魔されたくないという意向も含む",
    kind: "toggle",
    label: "おやすみモード",
    ask: "通知を止めるおやすみモードを有効にすべきか",
    trueMeans: "静かにしたい・通知を止めたい",
    falseMeans: "通知を受け取りたい・通常状態に戻したい",
    initial: false,
  },
  {
    id: "brightness",
    mentionHint: "明るさの度合い。「暗くして」「明るくして」のような指示も含む",
    kind: "score",
    label: "明るさ",
    ask: "照明の明るさをどのレベルにすべきか",
    levels: ["消灯", "かなり暗め", "普通", "明るめ", "最大"],
    min: 0,
    max: 100,
    unit: "%",
    initial: 2,
  },
  {
    id: "temperature",
    mentionHint: "室温を何度にするか。「暖かめ」「涼しく」のような体感の指定も含む",
    kind: "score",
    label: "設定温度",
    ask: "室温の設定をどのレベルにすべきか",
    levels: ["18°C（かなり涼しい）", "20°C", "22°C", "24°C", "26°C（かなり暖かい）"],
    min: 18,
    max: 26,
    unit: "°C",
    initial: 2,
  },
  {
    id: "scene",
    mentionHint: "作業・くつろぎ・映画鑑賞・就寝といった場面の切り替え。「そろそろ寝る」「作業に戻る」のような宣言も含む",
    kind: "choice",
    label: "シーン",
    ask: "どのシーンに切り替えるべきか",
    options: [
      { id: "work", label: "作業", hint: "集中して仕事や勉強をする" },
      { id: "relax", label: "くつろぎ", hint: "リラックスして過ごす" },
      { id: "movie", label: "映画", hint: "映像作品を鑑賞する" },
      { id: "sleep", label: "就寝", hint: "眠る準備をする" },
    ],
    initial: "work",
  },
];

export type ControlValue = boolean | number | string;
export type PanelState = Record<string, ControlValue>;

export const INITIAL_STATE: PanelState = Object.fromEntries(
  CONTROLS.map((c) => [c.id, c.initial]),
);

/** score のレベル位置（0〜levels.length-1）を実値に変換する。 */
export function scoreToValue(control: ScoreControl, score: number): number {
  const span = control.levels.length - 1;
  const ratio = span === 0 ? 0 : Math.min(Math.max(score, 0), span) / span;
  return control.min + ratio * (control.max - control.min);
}

/** 表示用の文字列。 */
export function formatValue(control: Control, value: ControlValue): string {
  switch (control.kind) {
    case "toggle":
      return value ? "ON" : "OFF";
    case "score": {
      const real = scoreToValue(control, Number(value));
      const digits = control.unit === "°C" ? 1 : 0;
      return `${real.toFixed(digits)}${control.unit}`;
    }
    case "choice":
      return (
        control.options.find((o) => o.id === value)?.label ?? String(value)
      );
  }
}
