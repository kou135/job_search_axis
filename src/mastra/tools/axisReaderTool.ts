import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { parse } from "yaml";

import { AxisSchema } from "../../schemas.js";
import { NotionService } from "./notionService.js";

export const axisReaderTool = createTool({
  id: "axis-reader",
  description: "Reads the axis YAML from the Notion root page and validates it.",
  inputSchema: z.object({
    rootPageId: z.string().min(1, "rootPageId is required"),
  }),
  outputSchema: AxisSchema,
  async execute({ context }) {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error("NOTION_TOKEN が設定されていません");
    }

    const notion = new NotionService(context.rootPageId, token);
    const axisPageId = await notion.ensureAxisPage();
    const axisYaml = await notion.getAxisYaml(axisPageId);
    return AxisSchema.parse(parse(axisYaml));
  },
});
