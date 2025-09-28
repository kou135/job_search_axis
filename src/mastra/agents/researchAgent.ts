import type { Events, ResearchRequest, Summary } from "../../schemas.js";
import { ResearchRequestSchema, SummarySchema } from "../../schemas.js";
import { fetchHtml } from "../tools/fetchHtml.js";
import { extractMainText } from "../tools/extractMainText.js";
import { summarizeArticle } from "../tools/llm.js";
import { extractLinksFromSearch } from "../tools/extractLinksFromSearch.js";
import type { Ctx } from "../context.js";

type NewsSource = {
  name: string;
  buildUrl: (request: ResearchRequest) => string;
  linkSelectors: string[];
};

const MAX_ARTICLES_PER_SOURCE = 2;

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

async function collectSummaries(
  request: ResearchRequest,
  ctxLog: (...args: unknown[]) => void
): Promise<Summary[]> {
  const summaries: Summary[] = [];

  for (const source of NEWS_SOURCES) {
    if (summaries.length >= request.limit) {
      break;
    }

    const searchUrl = source.buildUrl(request);

    try {
      const { html: searchHtml, url: resolvedSearchUrl } = await fetchHtml(searchUrl);

      const remainingCapacity = request.limit - summaries.length;
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
        ctxLog(`[ResearchAgent] 記事リンクが見つかりませんでした: ${resolvedSearchUrl}`);
        continue;
      }

      for (const articleUrl of articleUrls) {
        if (summaries.length >= request.limit) {
          break;
        }

        try {
          const { html: articleHtml, url: resolvedArticleUrl } = await fetchHtml(articleUrl);
          const extracted = extractMainText(articleHtml, resolvedArticleUrl);

          if (!extracted.text.trim()) {
            ctxLog(`[ResearchAgent] 本文が取得できませんでした: ${resolvedArticleUrl}`);
            continue;
          }

          const summary = await summarizeArticle({
            url: resolvedArticleUrl,
            title: extracted.title || `${request.company} ニュース`,
            text: extracted.text,
            axis: request.axis,
            language: "ja",
          });

          summaries.push(SummarySchema.parse(summary));
        } catch (error) {
          ctxLog(
            `[ResearchAgent] 記事処理に失敗しました (${articleUrl}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } catch (error) {
      ctxLog(
        `[ResearchAgent] 検索ページ取得に失敗しました (${searchUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return summaries;
}

export const researchAgent = {
  name: "ResearchAgent",
  async run(input: ResearchRequest, ctx: Ctx): Promise<Events["research.result"]> {
    const request = ResearchRequestSchema.parse(input);
    const summaries = await collectSummaries(request, ctx.log);
    const validated = summaries.map((summary) => SummarySchema.parse(summary));

    return {
      company: request.company,
      summaries: validated,
    } satisfies Events["research.result"];
  },
};
