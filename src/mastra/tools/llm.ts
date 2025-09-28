import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { SummarySchema, type Axis, type Summary } from "../../schemas.js";

const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();

const openaiClient =
  provider === "openai" && process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : undefined;

const geminiClient =
  provider === "gemini" && process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : undefined;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

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
  const prompt = `あなたは就職活動支援のリサーチャーです。以下の記事を読み、候補者の就活軸との適合度を評価しながら日本語で要約してください。\n\n` +
    `---\nAxis\n${buildAxisDescription(params.axis)}\n---\n` +
    `記事タイトル: ${params.title}\nURL: ${params.url}\n言語: ${params.language ?? "ja"}\n公開日: ${params.publishedAt ?? "不明"}\n本文:\n${params.text}\n\n` +
    `出力フォーマット（JSON）: { "bullets": string[] (3〜5件、日本語、各40〜60文字程度), "fitScore": number (0〜1で小数第2位まで) }`;

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{ text: prompt }],
    }],
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

async function summarizeWithOpenAI(params: SummarizeParams): Promise<Summary> {
  if (!openaiClient) {
    return fallbackSummary(params);
  }

  const axisDescription = buildAxisDescription(params.axis);

  const completion = await openaiClient.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは就職活動支援のリサーチャーです。入力された記事を分析し、候補者の就活軸との適合度を評価しながら日本語で要約してください。JSONで返してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Axis:\n${axisDescription}\n\nArticle Title: ${params.title}\nURL: ${params.url}\nLanguage: ${params.language ?? "ja"}\nPublished: ${params.publishedAt ?? "N/A"}\n\n本文:\n${params.text}`,
          },
          {
            type: "text",
            text: `出力フォーマット: { "bullets": string[] (3~5件、日本語、各40~60文字程度), "fitScore": number (0~1で小数第2位まで) }`,
          },
        ],
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLMから内容が返りませんでした");
  }

  const parsed = JSON.parse(content) as LlmSummaryResponse;
  const bullets = Array.isArray(parsed.bullets) && parsed.bullets.length > 0 ? parsed.bullets : undefined;

  if (!bullets) {
    throw new Error("LLM要約の形式が不正です");
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
    if (provider === "gemini") {
      return await summarizeWithGemini(params);
    }

    if (provider === "openai") {
      return await summarizeWithOpenAI(params);
    }

    return fallbackSummary(params);
  } catch (error) {
    console.warn("[LLM] 要約に失敗したためフォールバックを使用します:", error);
    return fallbackSummary(params);
  }
}
