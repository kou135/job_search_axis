import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getJson } from "serpapi";

import { ResearchRequestSchema, SummarySchema } from "../../schemas.js";
import { fetchHtml } from "./fetchHtml.js";
import { extractMainText } from "./extractMainText.js";
import { summarizeArticle } from "./llm.js";

const InputSchema = z.object({
  request: ResearchRequestSchema,
});

const OutputSchema = z.object({
  company: z.string(),
  summaries: z.array(SummarySchema),
});

type ResearchToolInput = z.infer<typeof InputSchema>;

const MAX_ARTICLE_TEXT_LENGTH = 2000;
const SERPAPI_TIMEOUT_MS = 30000;
const SERPAPI_MAX_RETRY = 5;
const SERPAPI_RETRY_BASE_DELAY_MS = 1000;
const AgentSummarySchema = SummarySchema.extend({
  publishedAt: z.string().nullable().optional(),
});

const AGENT_SUMMARY_SCHEMA = z.object({
  summaries: z.array(AgentSummarySchema),
});

type ArticleCandidate = {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
};

function sanitizeCompanyName(rawName: string): string {
  const withoutParens = rawName.replace(/（.*?）|\(.*?\)/g, "");
  const normalizedSpaces = withoutParens.replace(/[\s\u3000]+/g, " ").trim();
  return normalizedSpaces.length > 0 ? normalizedSpaces : rawName.trim();
}

function truncateArticleText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_ARTICLE_TEXT_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_ARTICLE_TEXT_LENGTH)}...`;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectArticles(request: ResearchToolInput["request"]): Promise<ArticleCandidate[]> {
  const apiKey =
    process.env.SERPAPI_KEY ?? process.env.SERP_API_KEY ?? process.env.GOOGLE_SERP_API_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_KEY が設定されていません");
  }

  const sanitizedCompany = sanitizeCompanyName(request.company);
  const query = `${sanitizedCompany} ニュース`;

  let response: any;
  for (let attempt = 1; attempt <= SERPAPI_MAX_RETRY; attempt += 1) {
    try {
      response = await getJson({
        engine: "google_news",
        q: query,
        hl: "ja",
        gl: "jp",
        api_key: apiKey,
        timeout: SERPAPI_TIMEOUT_MS,
      });
      break;
    } catch (error) {
      const isLast = attempt === SERPAPI_MAX_RETRY;
      console.warn(
        `[ResearchTool] SerpAPI 検索に失敗しました (company=${request.company}, query="${query}", attempt ${attempt}/${SERPAPI_MAX_RETRY}):`,
        error,
      );
      if (isLast) {
        console.warn(
          `[ResearchTool] SerpAPI の再試行が上限に達したため記事収集を中断します (company=${request.company}, query="${query}")`,
        );
        return [];
      }
      const backoff = SERPAPI_RETRY_BASE_DELAY_MS * 1.5 ** (attempt - 1);
      await delay(backoff);
    }
  }

  const results: any[] = Array.isArray(response?.news_results) ? response.news_results : [];
  if (results.length === 0) {
    console.warn(
      `[ResearchTool] SerpAPI からニュース結果が取得できませんでした (company=${request.company}, query="${query}")`,
    );
    return [];
  }

  const selected = shuffleArray(results).slice(0, request.limit);
  const articles: ArticleCandidate[] = [];

  for (const result of selected) {
    if (!result?.link) {
      continue;
    }

    try {
      const { html: articleHtml, url: resolvedUrl } = await fetchHtml(result.link);
      const extracted = extractMainText(articleHtml, resolvedUrl);

      const text = extracted.text.trim() ? extracted.text : result.snippet ?? "";
      if (!text.trim()) {
        console.warn(
          `[ResearchTool] 抽出本文が空のため記事をスキップします (${resolvedUrl})`,
        );
        continue;
      }

      articles.push({
        url: resolvedUrl,
        title: extracted.title || result.title || `${request.company} ニュース`,
        text: truncateArticleText(text),
        publishedAt: result.published_at ?? result.date ?? undefined,
      });
    } catch (error) {
      console.warn(
        `[ResearchTool] 記事取得に失敗しました (${result?.link}) (company=${request.company}):`,
        error,
      );
    }
  }

  if (articles.length === 0) {
    console.warn(
      `[ResearchTool] 有効な記事を収集できませんでした (company=${request.company}, query="${query}")`,
    );
  } else if (articles.length < request.limit) {
    console.warn(
      `[ResearchTool] 記事数が希望件数に満たないため不足分があります (company=${request.company}, collected=${articles.length}, limit=${request.limit})`,
    );
  }

  return articles;
}

type MastraLike = {
  getAgent?: (name: string) => { generate: (prompt: string) => Promise<{ text?: string | null }> } | undefined;
};

async function runResearchAgent(
  request: ResearchToolInput["request"],
  articles: ArticleCandidate[],
  mastra: MastraLike | undefined,
): Promise<z.infer<typeof SummarySchema>[] | null> {
  if (!mastra) {
    return null;
  }

  const agent = mastra.getAgent?.("researchAgent");
  if (!agent) {
    return null;
  }

  const payload = articles.map((article, index) => ({
    index,
    url: article.url,
    title: article.title,
    excerpt: article.text,
    publishedAt: article.publishedAt ?? null,
  }));

  const prompt = [
    "You receive pre-fetched article excerpts. Keep answers concise and follow the JSON format strictly.",
    `Company: ${request.company}`,
    `Axis JSON: ${JSON.stringify(request.axis)}`,
    `Requested limit: ${request.limit}`,
    `Articles: ${JSON.stringify(payload)}`,
    'Respond with JSON: {"summaries": Summary[]}. Limit to the most relevant items up to the requested limit.',
  ].join("\n\n");

  const generation = await agent.generate(prompt);
  const raw = generation.text ?? "{}";
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  const parsed = AGENT_SUMMARY_SCHEMA.parse(JSON.parse(cleaned));
  const normalized = parsed.summaries.slice(0, request.limit).map((summary) => {
    const { fitScore: _fitScore, ...rest } = summary;
    const normalizedPublishedAt = rest.publishedAt ?? undefined;
    return SummarySchema.parse({
      ...rest,
      publishedAt: normalizedPublishedAt,
    });
  });
  return normalized;
}

export const researchTool = createTool({
  id: "research",
  description: "指定した企業についてニュース要約を収集します",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async execute({ context, mastra }) {
    const request = InputSchema.parse(context).request;
    const articles = await collectArticles(request);

    let summaries: z.infer<typeof SummarySchema>[] = [];

    if (articles.length > 0) {
      try {
        const agentSummaries = await runResearchAgent(request, articles, mastra);
        if (agentSummaries && agentSummaries.length > 0) {
          summaries = agentSummaries;
        }
      } catch (error) {
        console.warn("[ResearchTool] エージェント要約に失敗しました。フォールバックを使用します:", error);
      }
    }

    if (summaries.length === 0) {
      for (const article of articles.slice(0, request.limit)) {
        try {
          const rawSummary = await summarizeArticle({
            url: article.url,
            title: article.title,
            text: article.text,
            axis: request.axis,
            language: "ja",
          });
          const { fitScore: _fitScore, ...rest } = rawSummary;
          summaries.push(SummarySchema.parse(rest));
        } catch (error) {
          console.warn(`[ResearchTool] フォールバック要約に失敗しました (${article.url}):`, error);
        }
      }
    }

    return {
      company: request.company,
      summaries,
    };
  },
});
