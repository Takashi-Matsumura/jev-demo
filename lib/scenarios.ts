/**
 * 展示会などで流しっぱなしにするためのデモシナリオ。
 *
 * 各手順は「送る指示」と「観客に読ませる一言」の組。
 * hold はその手順の結果を見せておく時間（ミリ秒）で、
 * 見せ場ほど長めに取ってある。
 */

export type ScenarioStep = {
  command: string;
  /** 観客向けの説明。何が起きるかを先に言っておく */
  note: string;
  /** 送信後、次の手順に移るまでの表示時間（ミリ秒） */
  hold?: number;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  steps: ScenarioStep[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: "day",
    title: "一日の流れ",
    description: "朝から就寝まで。話し言葉だけで部屋が変わっていきます",
    steps: [
      {
        command: "おはよう。仕事を始めるから明るくして",
        note: "1 回の指示で、照明・明るさ・シーンの 3 つが同時に動きます",
      },
      {
        command: "ちょっと寒いな",
        note: "「エアコン」とも「何度」とも言っていません。体感の訴えから設定温度が決まります",
        hold: 5500,
      },
      {
        command: "空気が乾いてきた",
        note: "言及されたコントロールだけが動きます。照明や温度はそのままです",
      },
      {
        command: "映画を見るからいい感じにして",
        note: "曖昧な指示。確率が割れたものは自動で適用せず、確認を挟みます",
        hold: 6000,
      },
      {
        command: "やっぱり明るさは半分くらいで",
        note: "「半分」は今の値を知らないと解釈できません。現在の状態も一緒に送っています",
        hold: 5500,
      },
      {
        command: "そろそろ寝る。通知も止めて",
        note: "「おやすみモード」という言葉は出てきませんが、意味として拾います",
        hold: 6000,
      },
    ],
  },
  {
    id: "primitives",
    title: "3 つのプリミティブ",
    description: "Noul / Score / Choice がそれぞれ何を返すかを順に見せます",
    steps: [
      {
        command: "加湿器をつけて",
        note: "Noul：ON か OFF かを P(true) で返します。右のコンソールで確率を確認できます",
        hold: 6000,
      },
      {
        command: "暑いので思いきり涼しくして",
        note: "Score：5 段階の上の小数位置が返り、18〜26°C に対応づけています",
        hold: 6000,
      },
      {
        command: "くつろぎたい",
        note: "Choice：4 つのシーンから 1 つ。選ばれなかった候補の確率も返ります",
        hold: 6000,
      },
      {
        command: "全部消して",
        note: "複数の Noul が同時に false 側へ。14 問すべてが 1 リクエストで並列に評価されています",
        hold: 6000,
      },
    ],
  },
];
