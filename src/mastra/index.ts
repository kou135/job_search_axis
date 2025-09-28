import "dotenv/config";

import {
  axisReader,
  type AxisReaderInput,
  type AxisReadyPayload,
} from "./agents/axisReader.js";
import { researchAgent } from "./agents/researchAgent.js";
import type { Events, ResearchRequest } from "../schemas.js";
import type { Ctx } from "./framework/mastra-lite.js";

const ctx: Ctx = {
  log: (...args) => console.log(...args),
};

export async function runAxisReader(input: AxisReaderInput): Promise<AxisReadyPayload> {
  return axisReader.run(input, ctx);
}

export async function runResearchAgent(
  input: ResearchRequest
): Promise<Events["research.result"]> {
  return researchAgent.run(input, ctx);
}
