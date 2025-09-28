import { defineAgent } from "../framework/mastra-lite.js";
import type { Events } from "../../schemas.js";
import { appendSummariesToDocx } from "../tools/docxWriter.js";

const DEFAULT_OUTPUT_DOCX = "./out/JobSearch_KnowledgeBase.docx";

export const writerAgent = defineAgent<
  Events["write.request"],
  Events["write.result"]
>("WriterAgent", async (input, ctx) => {
  const docPath = process.env.OUTPUT_DOCX ?? DEFAULT_OUTPUT_DOCX;
  const { company, accepted } = input;

  if (accepted.length === 0) {
    ctx.log(`[WriterAgent] 受理された要約がないため出力をスキップしました (${company})`);
    return {
      company,
      written: 0,
      docPath,
    } satisfies Events["write.result"];
  }

  await appendSummariesToDocx(docPath, company, accepted);
  ctx.log(`[WriterAgent] ${accepted.length} 件の要約を出力しました: ${docPath}`);

  return {
    company,
    written: accepted.length,
    docPath,
  } satisfies Events["write.result"];
});
