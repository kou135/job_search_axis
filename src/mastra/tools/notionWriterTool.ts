import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { AxisSchema, SummarySchema } from "../../schemas.js";
import { NotionService } from "./notionService.js";

const InputSchema = z.object({
  rootPageId: z.string().min(1),
  company: z.string().min(1),
  summaries: z.array(SummarySchema).min(1),
  axis: AxisSchema,
  headingDate: z.string().optional(),
});

const OutputSchema = z.object({
  company: z.string(),
  written: z.number().int().min(0),
  pageId: z.string(),
});

type MastraLike = {
  getAgent?: (name: string) => { generate: (prompt: string) => Promise<{ text?: string | null }> } | undefined;
};

const WriterAgentSchema = z.object({
  intro: z.string().min(1),
  headingDate: z.string().optional(),
});

export const notionWriterTool = createTool({
  id: "notion-writer",
  description: "受理された要約を Notion の企業ページに追記します",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async execute({ context, mastra, runtimeContext }) {
    const { rootPageId, company, summaries, headingDate, axis } = InputSchema.parse(context);

    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error("NOTION_TOKEN が設定されていません");
    }

    const notion = new NotionService(rootPageId, token);
    const companyPageId = await notion.ensureCompanyPage(company);

    let introParagraph: string | undefined;
    let headingOverride: string | undefined;

    const summaryPayload = summaries.map((summary) => ({
      title: summary.title,
      url: summary.url,
      fitScore: Number(summary.fitScore.toFixed(2)),
      publishedAt: summary.publishedAt ?? null,
      bullets: summary.bullets,
    }));

    try {
      const agent = (mastra as MastraLike | undefined)?.getAgent?.("writerAgent");
      if (agent) {
        const prompt = [
          "You craft intro text for Notion research notes in Japanese.",
          `Company: ${company}`,
          `Axis: ${JSON.stringify(axis)}`,
          `Summaries: ${JSON.stringify(summaryPayload)}`,
          'Respond with JSON {"intro": string, "headingDate"?: string}. Intro must be 1-2 sentences in natural Japanese referencing the axis focus. If you do not wish to override the heading date, omit headingDate.',
        ].join("\n\n");

        const generation = await agent.generate(prompt);
        const raw = generation.text ?? "{}";
        const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
        const parsed = WriterAgentSchema.safeParse(JSON.parse(cleaned));
        if (parsed.success) {
          introParagraph = parsed.data.intro.trim();
          headingOverride = parsed.data.headingDate?.trim();
        }
      }
    } catch (error) {
      console.warn("[NotionWriter] エージェントによるイントロ生成に失敗しました:", error);
    }

    const headingText = headingOverride || headingDate || new Date().toISOString().slice(0, 10);

    await notion.appendSummaries(companyPageId, headingText, summaries, introParagraph);

    return {
      company,
      written: summaries.length,
      pageId: companyPageId,
    };
  },
});
