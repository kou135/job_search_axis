import { format } from "date-fns";

import { defineAgent } from "../framework/mastra-lite.js";
import type { Events } from "../../schemas.js";
import { NotionService } from "../tools/notionService.js";

export const writerAgent = defineAgent<
  Events["write.request"],
  Events["write.result"]
>("WriterAgent", async (input, ctx) => {
  const token = process.env.NOTION_TOKEN;
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;

  if (!token) {
    throw new Error("NOTION_TOKEN が設定されていません");
  }
  if (!rootPageId) {
    throw new Error("NOTION_ROOT_PAGE_ID が設定されていません");
  }

  if (input.accepted.length === 0) {
    ctx.log(`[WriterAgent] 受理された要約がないため出力をスキップしました (${input.company})`);
    return {
      company: input.company,
      written: 0,
      pageId: rootPageId,
    } satisfies Events["write.result"];
  }

  const notion = new NotionService(rootPageId, token);
  const companyPageId = await notion.ensureCompanyPage(input.company);

  const headingDate = format(new Date(), "yyyy-MM-dd");
  await notion.appendSummaries(companyPageId, headingDate, input.accepted);

  ctx.log(`[WriterAgent] ${input.accepted.length} 件の要約を Notion に追記しました (${input.company})`);

  return {
    company: input.company,
    written: input.accepted.length,
    pageId: companyPageId,
  } satisfies Events["write.result"];
});
