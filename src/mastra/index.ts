import "dotenv/config";

import { Mastra } from "@mastra/core/mastra";

import { orchestratorAgent } from "./agents/orchestratorAgent.js";
import { researchAgent } from "./agents/researchAgent.js";
import { policyAgent } from "./agents/policyAgent.js";
import { writerAgent } from "./agents/writerAgent.js";
import { jobSearchWorkflow } from "./workflows/jobSearchWorkflow.js";

export const mastra = new Mastra({
  agents: {
    orchestratorAgent,
    researchAgent,
    policyAgent,
    writerAgent,
  },
  workflows: {
    jobSearchWorkflow,
  },
});
