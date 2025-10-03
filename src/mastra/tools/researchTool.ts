import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { ResearchRequestSchema, SummarySchema } from "../../schemas.js";
import { fetchHtml } from "./fetchHtml.js";
import { extractMainText } from "./extractMainText.js";
import { extractLinksFromSearch } from "./extractLinksFromSearch.js";
import { summarizeArticle } from "./llm.js";

const InputSchema = z.object({
  request: ResearchRequestSchema,
});

const OutputSchema = z.object({
  company: z.string(),
  summaries: z.array(SummarySchema),
});

type ResearchToolInput = z.infer<typeof InputSchema>;

type NewsSource = {
  name: string;
  buildUrl: (request: ResearchToolInput["request"]) => string;
  linkSelectors: string[];
};

const MAX_ARTICLES_PER_SOURCE = 2;
const MAX_ARTICLE_TEXT_LENGTH = 2000;
const AGENT_SUMMARY_SCHEMA = z.object({
  summaries: z.array(SummarySchema),
});

type ArticleCandidate = {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
};
const NEWS_SOURCES: NewsSource[] = [
  {
    name: "techcrunch",
    buildUrl: (request) =>
      `https://techcrunch.com/search/${encodeURIComponent(
        `${request.company} ${request.axis.industries[0] ?? ""}`
      )}`,
    linkSelectors: ["a.loop-card__title-link", ".post-block__title a"],
  },
];

function truncateArticleText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_ARTICLE_TEXT_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_ARTICLE_TEXT_LENGTH)}...`;
}

async function collectArticles(request: ResearchToolInput["request"]): Promise<ArticleCandidate[]> {
  const articles: ArticleCandidate[] = [];

  for (const source of NEWS_SOURCES) {
    if (articles.length >= request.limit) {
      break;
    }

    const searchUrl = source.buildUrl(request);

    try {
      const { html: searchHtml, url: resolvedSearchUrl } = await fetchHtml(searchUrl);

      const remainingCapacity = request.limit - articles.length;
      const perSourceLimit = Math.min(MAX_ARTICLES_PER_SOURCE, remainingCapacity);
      const articleUrls: string[] = [];

      for (const selector of source.linkSelectors) {
        const needed = perSourceLimit - articleUrls.length;
        if (needed <= 0) {
          break;
        }

        const extractedUrls = extractLinksFromSearch(searchHtml, resolvedSearchUrl, selector, needed);
        for (const url of extractedUrls) {
          if (!articleUrls.includes(url)) {
            articleUrls.push(url);
          }
          if (articleUrls.length >= perSourceLimit) {
            break;
          }
        }
      }

      if (articleUrls.length === 0) {
        continue;
      }

      for (const articleUrl of articleUrls) {
        if (articles.length >= request.limit) {
          break;
        }

        try {
          const { html: articleHtml, url: resolvedArticleUrl } = await fetchHtml(articleUrl);
          const extracted = extractMainText(articleHtml, resolvedArticleUrl);

          if (!extracted.text.trim()) {
            continue;
          }

          articles.push({
            url: resolvedArticleUrl,
            title: extracted.title || `${request.company} ニュース`,
            text: truncateArticleText(extracted.text),
          });
        } catch (error) {
          console.warn(`[ResearchTool] 記事処理に失敗しました (${articleUrl}):`, error);
        }
      }
    } catch (error) {
      console.warn(`[ResearchTool] 検索ページ取得に失敗しました (${searchUrl}):`, error);
    }
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
  return parsed.summaries.slice(0, request.limit).map((summary) => SummarySchema.parse(summary));
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
          const summary = await summarizeArticle({
            url: article.url,
            title: article.title,
            text: article.text,
            axis: request.axis,
            language: "ja",
          });
          summaries.push(SummarySchema.parse(summary));
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
