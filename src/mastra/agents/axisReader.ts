import { parse } from "yaml";

import { defineAgent } from "../framework/mastra-lite.js";
import type { Events } from "../../schemas.js";
import { AxisSchema } from "../../schemas.js";
import { NotionService } from "../tools/notionService.js";

export interface AxisReaderInput {
  rootPageId: string;
  companies: string[];
  recencyDays: number;
  limit: number;
}

export type AxisReadyPayload = Events["axis.ready"];

export const axisReader = defineAgent<AxisReaderInput, AxisReadyPayload>(
  "AxisReader",
  async (input, ctx) => {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error("NOTION_TOKEN が設定されていません");
    }

    const notion = new NotionService(input.rootPageId, token);
    const axisPageId = await notion.ensureAxisPage();
    const axisYaml = await notion.getAxisYaml(axisPageId);
    const axis = AxisSchema.parse(parse(axisYaml));

    ctx.log(
      `[AxisReader] Axis YAML を Notion から読み込みました (roles: ${axis.roles.length}, industries: ${axis.industries.length})`
    );

    return {
      axis,
      companies: input.companies,
      recencyDays: input.recencyDays,
      limit: input.limit,
    } satisfies AxisReadyPayload;
  }
);
