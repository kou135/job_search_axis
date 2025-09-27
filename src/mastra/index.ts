import "dotenv/config";

import {
  axisReader,
  type AxisReaderInput,
  type AxisReadyPayload,
} from "./agents/axisReader.js";
import type { Ctx } from "./framework/mastra-lite.js";

const ctx: Ctx = {
  log: (...args) => console.log(...args),
};

export async function runAxisReader(input: AxisReaderInput): Promise<AxisReadyPayload> {
  return axisReader.run(input, ctx);
}
