import { defineAgent } from "../framework/mastra-lite.js";
import type { Events, ResearchRequest, Summary } from "../../schemas.js";
import { ResearchRequestSchema, SummarySchema } from "../../schemas.js";
import { fetchHtml } from "../tools/fetchHtml.js";
import { extractMainText } from "../tools/extractMainText.js";
import { summarizeArticle } from "../tools/llm.js";

const NEWS_SOURCES: Array<
  (request: ResearchRequest) => string
> = [
  (request) =>
    `https://www.reuters.com/site-search/?query=${encodeURIComponent(
      `${request.company} ${request.axis.industries[0] ?? ""}`
    )}`,
  (request) =>
    `https://techcrunch.com/search/${encodeURIComponent(
      `${request.company} ${request.axis.industries[0] ?? ""}`
    )}`
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function collectSummaries(request: ResearchRequest, ctxLog: (...args: unknown[]) => void) {
  const summaries: Summary[] = [];

  for (const buildUrl of NEWS_SOURCES) {
    if (summaries.length >= request.limit) {
      break;
    }

    const targetUrl = buildUrl(request);

    try {
      const { html, url } = await fetchHtml(targetUrl);
      const extracted = extractMainText(html, url);

      if (!extracted.text.trim()) {
        ctxLog(`[ResearchAgent] 本文が取得できませんでした: ${url}`);
        continue;
      }

      const summary = await summarizeArticle({
        url,
        title: extracted.title || `${request.company} ニュース`,
        text: extracted.text,
        axis: request.axis,
        language: "ja",
      });

      summaries.push(SummarySchema.parse(summary));
    } catch (error) {
      ctxLog(
        `[ResearchAgent] 収集に失敗しました (${targetUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return summaries.slice(0, request.limit);
}

export const researchAgent = defineAgent<ResearchRequest, Events["research.result"]>(
  "ResearchAgent",
  async (input, ctx) => {
    const request = ResearchRequestSchema.parse(input);
    const summaries = await collectSummaries(request, ctx.log);
    const validated = summaries.map((summary) => SummarySchema.parse(summary));

    return {
      company: request.company,
      summaries: validated,
    } satisfies Events["research.result"];
  }
);
