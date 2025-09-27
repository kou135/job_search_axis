import { defineAgent } from "../framework/mastra-lite.js";
import type { Events } from "../../schemas";
import { readAxisFromDocx } from "../tools/readAxisYaml.js";

export interface AxisReaderInput {
  docPath: string;
  companies: string[];
  recencyDays: number;
  limit: number;
}

export type AxisReadyPayload = Events["axis.ready"];

export const axisReader = defineAgent<AxisReaderInput, AxisReadyPayload>(
  "AxisReader",
  async (input, ctx) => {
    const axis = await readAxisFromDocx(input.docPath);
    ctx.log(
      `[AxisReader] AXIS を読み込みました (roles: ${axis.roles.length}, industries: ${axis.industries.length})`
    );

    return {
      axis,
      companies: input.companies,
      recencyDays: input.recencyDays,
      limit: input.limit,
    } satisfies AxisReadyPayload;
  }
);
