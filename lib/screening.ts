/**
 * PDF を外部の AI に渡す前の事前チェック。
 *
 * 抽出したテキストをチャンクに割り、チャンクごとに同じ質問セットを投げる。
 * jev は文章を生成しないので、判定結果に本文が混ざって出てくることがない。
 * 「中身を見ずに、中身の性質だけを数値で受け取る」形になる。
 */

import type { JevAnswer, JevQuestion } from "./jev";

export type Category = {
  id: string;
  label: string;
  instructions: string;
  trueMeans: string;
  falseMeans: string;
  /** 1 件でも該当すれば送信を止めるべき種類か */
  severe: boolean;
};

export const CATEGORIES: Category[] = [
  {
    id: "person_name",
    label: "個人名",
    instructions: "この文書に特定の個人の氏名が含まれているか",
    trueMeans: "実在の人物と分かる氏名が書かれている",
    falseMeans: "氏名は出てこない、または一般名詞や役職のみ",
    severe: false,
  },
  {
    id: "contact",
    label: "連絡先",
    instructions:
      "この文書に個人または社員の連絡先（住所・電話番号・メールアドレス）が含まれているか",
    trueMeans: "住所・電話番号・メールアドレスのいずれかが書かれている",
    falseMeans: "連絡先は書かれていない",
    severe: false,
  },
  {
    id: "gov_id",
    label: "公的な識別番号",
    instructions:
      "マイナンバー、運転免許証番号、パスポート番号、健康保険証番号などの公的な識別番号が含まれているか",
    trueMeans: "公的機関が発行する個人の識別番号が書かれている",
    falseMeans: "そうした番号は書かれていない",
    severe: true,
  },
  {
    id: "financial",
    label: "金融情報",
    instructions:
      "銀行口座番号、クレジットカード番号などの金融口座情報が含まれているか",
    trueMeans: "口座番号やカード番号が書かれている",
    falseMeans: "金額の記載はあっても、口座やカードの番号は書かれていない",
    severe: true,
  },
  {
    id: "credentials",
    label: "認証情報",
    instructions:
      "パスワード、API キー、アクセストークン、秘密鍵などの認証情報が含まれているか",
    trueMeans: "そのまま使える認証情報が書かれている",
    falseMeans: "認証情報は書かれていない",
    severe: true,
  },
  {
    id: "sensitive_personal",
    label: "要配慮個人情報",
    instructions:
      "健康状態、病歴、障害、信条、犯罪歴など、取り扱いに配慮を要する個人情報が含まれているか",
    trueMeans: "特定の個人のそうした情報が書かれている",
    falseMeans: "そうした情報は書かれていない",
    severe: true,
  },
  {
    id: "hr",
    label: "人事情報",
    instructions:
      "給与額、人事評価、採用選考の内容など、社員個人の人事情報が含まれているか",
    trueMeans: "特定の社員の人事情報が書かれている",
    falseMeans: "人事情報は書かれていない",
    severe: false,
  },
  {
    id: "customer",
    label: "顧客・取引先情報",
    instructions:
      "顧客や取引先を特定できる情報（企業名と取引内容の組み合わせなど）が含まれているか",
    trueMeans: "実在の顧客・取引先とその取引内容が分かる",
    falseMeans: "そうした情報は書かれていない、または匿名化されている",
    severe: false,
  },
  {
    id: "confidential_business",
    label: "社外秘の経営情報",
    instructions:
      "未公開の売上・原価・価格戦略・M&A など、社外に出せない経営情報が含まれているか",
    trueMeans: "公表されていない経営・財務情報が書かれている",
    falseMeans: "公開情報の範囲にとどまる",
    severe: false,
  },
  {
    id: "nda_marked",
    label: "機密表示",
    instructions:
      "「社外秘」「機密」「Confidential」「取扱注意」などの機密表示、または秘密保持義務への言及があるか",
    trueMeans: "文書自体に機密である旨の表示や記載がある",
    falseMeans: "そうした表示はない",
    severe: false,
  },
  {
    id: "source_code",
    label: "非公開の技術情報",
    instructions:
      "自社の非公開ソースコード、システム構成、脆弱性情報などが含まれているか",
    trueMeans: "外部に出すと技術的なリスクになる情報が書かれている",
    falseMeans: "そうした情報は書かれていない",
    severe: true,
  },
];

export const RISK_LEVELS = [
  "公開情報のみ。外部の AI に渡しても支障がない",
  "軽微。個人を特定できない一般的な業務情報にとどまる",
  "注意。個人情報または社内限りの情報を含む",
  "危険。特定個人の機密情報または企業秘密を含む",
  "重大。認証情報や法的に保護された情報を含み、外部に出してはならない",
];

export const DOC_TYPES: Record<string, string> = {
  contract: "契約書・法務文書",
  invoice: "請求書・見積書などの取引書類",
  hr: "履歴書・人事関連の文書",
  minutes: "議事録・社内報告",
  technical: "技術文書・仕様書",
  marketing: "広報・マーケティング資料",
  personal: "個人の私的な文書",
  other: "その他",
};

export const RECOMMENDATIONS: Record<string, string> = {
  allow: "そのまま外部の AI に渡してよい",
  redact: "該当箇所を伏せれば渡してよい",
  block: "外部の AI に渡すべきではない",
};

export function buildScreeningQuestions(): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};

  for (const category of CATEGORIES) {
    questions[category.id] = {
      type: "noul",
      instructions: category.instructions,
      criteria: { true: category.trueMeans, false: category.falseMeans },
    };
  }

  questions.exposure_risk = {
    type: "score",
    instructions:
      "この文書を社外の AI サービスに渡した場合のリスクはどの程度か",
    criteria: RISK_LEVELS,
  };

  questions.doc_type = {
    type: "choice",
    instructions: "この文書はどの種類か",
    criteria: DOC_TYPES,
  };

  questions.recommendation = {
    type: "choice",
    instructions: "この文書を社外の AI に渡してよいか",
    criteria: RECOMMENDATIONS,
  };

  return questions;
}

export type CategoryFinding = {
  id: string;
  label: string;
  severe: boolean;
  /** チャンク全体での最大確率 */
  probability: number;
  /** 最大値が出たチャンクの番号（0 始まり） */
  chunkIndex: number;
};

export type ScreeningSummary = {
  findings: CategoryFinding[];
  risk: { score: number; level: string; chunkIndex: number };
  docType: { id: string; label: string; confidence: number };
  /** jev 自身の総合判断（チャンク中もっとも厳しいもの） */
  jevRecommendation: { id: string; label: string; confidence: number };
  /** しきい値で決まる、アプリ側の結論 */
  verdict: "allow" | "review" | "block";
  chunkCount: number;
};

/** これ以上なら「含まれている」とみなす。 */
const DETECT = 0.5;
/** severe なカテゴリがこれ以上なら送信を止める。 */
const BLOCK = 0.8;

const RECOMMENDATION_ORDER = ["allow", "redact", "block"];

export function summarize(
  perChunk: Record<string, JevAnswer>[],
): ScreeningSummary {
  const findings: CategoryFinding[] = CATEGORIES.map((category) => {
    let probability = 0;
    let chunkIndex = 0;
    perChunk.forEach((answers, index) => {
      const answer = answers[category.id];
      if (answer?.type === "noul" && answer.noul > probability) {
        probability = answer.noul;
        chunkIndex = index;
      }
    });
    return {
      id: category.id,
      label: category.label,
      severe: category.severe,
      probability,
      chunkIndex,
    };
  }).sort((a, b) => b.probability - a.probability);

  let score = 0;
  let riskChunk = 0;
  perChunk.forEach((answers, index) => {
    const answer = answers.exposure_risk;
    if (answer?.type === "score" && answer.score > score) {
      score = answer.score;
      riskChunk = index;
    }
  });

  const docType = pickChoice(perChunk, "doc_type", DOC_TYPES);
  const jevRecommendation = pickWorstChoice(
    perChunk,
    "recommendation",
    RECOMMENDATIONS,
  );

  const severeHit = findings.some((f) => f.severe && f.probability >= BLOCK);
  const anyHit = findings.some((f) => f.probability >= DETECT);
  const verdict = severeHit ? "block" : anyHit ? "review" : "allow";

  return {
    findings,
    risk: {
      score,
      level: RISK_LEVELS[Math.round(score)] ?? RISK_LEVELS[0],
      chunkIndex: riskChunk,
    },
    docType,
    jevRecommendation,
    verdict,
    chunkCount: perChunk.length,
  };
}

/** もっとも自信のあるチャンクの答えを採る。 */
function pickChoice(
  perChunk: Record<string, JevAnswer>[],
  key: string,
  labels: Record<string, string>,
) {
  let id = Object.keys(labels)[0];
  let confidence = 0;
  for (const answers of perChunk) {
    const answer = answers[key];
    if (answer?.type === "choice" && answer.confidence > confidence) {
      confidence = answer.confidence;
      id = answer.choice;
    }
  }
  return { id, label: labels[id] ?? id, confidence };
}

/** もっとも厳しい答えを採る。1 箇所でも危なければ全体が危ない。 */
function pickWorstChoice(
  perChunk: Record<string, JevAnswer>[],
  key: string,
  labels: Record<string, string>,
) {
  let rank = -1;
  let id = RECOMMENDATION_ORDER[0];
  let confidence = 0;
  for (const answers of perChunk) {
    const answer = answers[key];
    if (answer?.type !== "choice") continue;
    const current = RECOMMENDATION_ORDER.indexOf(answer.choice);
    if (current > rank) {
      rank = current;
      id = answer.choice;
      confidence = answer.confidence;
    }
  }
  return { id, label: labels[id] ?? id, confidence };
}

/** 長い本文をチャンクに割る。段落の切れ目を優先する。 */
export function chunkText(
  text: string,
  { size = 1200, maxChunks = 16 } = {},
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length && chunks.length < maxChunks) {
    let end = Math.min(cursor + size, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf("。", end);
      if (boundary > cursor + size * 0.5) end = boundary + 1;
    }
    chunks.push(normalized.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}
