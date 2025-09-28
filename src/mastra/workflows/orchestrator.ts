import type { Axis } from "../../schemas.js";
import type { Events } from "../../schemas.js";

import { runAxisReader, runResearchAgent, runPolicyCheck, runWriterAgent } from "../index.js";

export interface OrchestratorOptions {
  rootPageId: string;
  companies: string[];
  limit: number;
  recencyDays: number;
}

export async function orchestrateNotionWorkflow(options: OrchestratorOptions) {
  if (options.companies.length === 0) {
    console.log("[Orchestrator] 会社が指定されていません");
    return;
  }

  const axisReady = await runAxisReader({
    rootPageId: options.rootPageId,
    companies: options.companies,
    limit: options.limit,
    recencyDays: options.recencyDays,
  });

  await processCompanies(axisReady.axis, options);
}

async function processCompanies(axis: Axis, options: OrchestratorOptions) {
  for (const company of options.companies) {
    console.log(`\n[Orchestrator] ==== ${company} ====`);

    const research = await runResearchAgent({
      company,
      limit: options.limit,
      recencyDays: options.recencyDays,
      axis,
    });

    console.log(`[Orchestrator] research summaries: ${research.summaries.length}`);

    const qc = await runPolicyCheck({
      company,
      summaries: research.summaries,
      policy: {
        maxChars: 200,
        maxBullets: 5,
        minFitScore: 0.5,
        recencyDays: options.recencyDays,
        language: "ja",
      },
    });

    console.log(
      `[Orchestrator] accepted: ${qc.accepted.length}, rejected: ${qc.rejected.length}`
    );

    await runWriterAgent(qc);
  }
}
