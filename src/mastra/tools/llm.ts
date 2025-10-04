import { GoogleGenerativeAI } from "@google/generative-ai";

import { SummarySchema, type Axis, type Summary } from "../../schemas.js";

const geminiClient =
  process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : undefined;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

interface SummarizeParams {
  url: string;
  title: string;
  text: string;
  axis: Axis;
  language?: "ja" | "en";
  publishedAt?: string;
}

interface LlmSummaryResponse {
  bullets: string[];
  fitScore: number;
}

function computeWordCount(bullets: string[]): number {
  const joined = bullets.join("");
  return [...joined].filter((char) => !/\s/u.test(char)).length;
}

function fallbackSummary(params: SummarizeParams): Summary {
  const sentences = params.text
    .split(/(?<=[。.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);

  const bullets = sentences.length > 0 ? sentences : [params.text.slice(0, 120) + "…"];

  return SummarySchema.parse({
    url: params.url,
    title: params.title,
    bullets,
    wordCount: computeWordCount(bullets),
    publishedAt: params.publishedAt,
    fitScore: 0.5,
  });
}

function buildAxisDescription(axis: Axis): string {
  const lines = [
    `Roles: ${axis.roles.join(", ")}`,
    `Industries: ${axis.industries.join(", ")}`,
  ];
  if (axis.keywords && axis.keywords.length > 0) {
    lines.push(`Keywords: ${axis.keywords.join(", ")}`);
  }
  return lines.join("\n");
}

function normalizeJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return trimmed;
}

async function summarizeWithGemini(params: SummarizeParams): Promise<Summary> {
  if (!geminiClient) {
    return fallbackSummary(params);
  }

  const model = geminiClient.getGenerativeModel({ model: GEMINI_MODEL });
  const axisDescription = buildAxisDescription(params.axis);

  const prompt = `あなたは就職活動支援のリサーチャーです。以下の要件に従って、候補者の就活軸との適合度を考慮しながら日本語で要約してください。\n\n` +
    `1. 応答は必ず JSON のみで返すこと（余計な見出し・コードフェンス・Markdownは禁止）。\n` +
    `2. JSON の形式は { "bullets": string[], "fitScore": number } とすること。\n` +
    `3. "bullets" は 3〜5 件の日本語で、各40〜60文字程度に収めること。\n` +
    `4. "fitScore" は 0〜1 の小数第2位までで、Axis との適合度を示すこと。\n` +
    `5. 上記以外の文字列やコメント、Markdown を絶対に返さないこと。\n\n` +
    `---\nAxis\n${axisDescription}\n---\n` +
    `記事タイトル: ${params.title}\nURL: ${params.url}\n言語: ${params.language ?? "ja"}\n公開日: ${params.publishedAt ?? "不明"}\n本文:\n${params.text}`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  });

  const rawText = result.response?.text();
  if (!rawText) {
    throw new Error("Geminiから内容が返りませんでした");
  }

  const parsed = JSON.parse(normalizeJsonText(rawText)) as LlmSummaryResponse;
  const bullets = Array.isArray(parsed.bullets) && parsed.bullets.length > 0 ? parsed.bullets : undefined;
  if (!bullets) {
    throw new Error("Gemini要約の形式が不正です");
  }

  const fitScore = typeof parsed.fitScore === "number" ? parsed.fitScore : 0.5;

  return SummarySchema.parse({
    url: params.url,
    title: params.title,
    bullets,
    wordCount: computeWordCount(bullets),
    publishedAt: params.publishedAt,
    fitScore,
  });
}


export async function summarizeArticle(params: SummarizeParams): Promise<Summary> {
  if (!params.text.trim()) {
    throw new Error("要約対象の本文が空です");
  }

  try {
    if (geminiClient) {
      return await summarizeWithGemini(params);
    }

    return fallbackSummary(params);
  } catch (error) {
    console.warn("[LLM] 要約に失敗したためフォールバックを使用します:", error);
    return fallbackSummary(params);
  }
}
