import "dotenv/config";

import {
  axisReader,
  type AxisReaderInput,
  type AxisReadyPayload,
} from "./agents/axisReader.js";
import { researchAgent } from "./agents/researchAgent.js";
import { policyCheckAgent } from "./agents/policyCheckAgent.js";
import { writerAgent } from "./agents/writerAgent.js";
import type { Events, ResearchRequest } from "../schemas.js";
import type { Ctx } from "./context.js";

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

export async function runPolicyCheck(
  input: Events["qc.request"]
): Promise<Events["qc.result"]> {
  return policyCheckAgent.run(input, ctx);
}

export async function runWriterAgent(
  input: Events["write.request"]
): Promise<Events["write.result"]> {
  return writerAgent.run(input, ctx);
}
