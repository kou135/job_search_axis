import "dotenv/config";

import { mastra } from "../../mastra/index.js";

const WORKFLOW_ID = "jobSearchWorkflow";

type WorkflowInput = {
  rootPageId: string;
  limit: number;
  recencyDays: number;
};

function ensureEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value.trim();
}

function parseNumber(value: string | undefined, fallback: number, label: string): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} は正の数値を指定してください (value='${value}')`);
  }
  return parsed;
}

async function runWorkflow(): Promise<void> {
  const workflow = mastra.getWorkflow(WORKFLOW_ID);
  if (!workflow) {
    throw new Error(`Workflow '${WORKFLOW_ID}' が見つかりません`);
  }

  const rootPageId = ensureEnv("NOTION_ROOT_PAGE_ID");
  const limit = parseNumber(
    process.env.WORKFLOW_LIMIT ?? process.env.DEFAULT_LIMIT,
    3,
    "WORKFLOW_LIMIT"
  );
  const recencyDays = parseNumber(
    process.env.WORKFLOW_RECENCY_DAYS ?? process.env.DEFAULT_RECENCY_DAYS,
    300,
    "WORKFLOW_RECENCY_DAYS"
  );

  const input: WorkflowInput = {
    rootPageId,
    limit,
    recencyDays,
  };

  const run = await workflow.createRunAsync();
  const result = await run.start({ inputData: input });

  if (result.status !== "success") {
    console.error(`[Workflow] run ended with status '${result.status}'`);
    if (result.status === "failed") {
      console.error("[Workflow] error:", result.error);
    }
    console.error("[Workflow] step states:", result.steps);
    process.exit(1);
  }

  console.log("[Workflow] completed successfully");
}

void runWorkflow().catch((error) => {
  console.error("[Workflow] execution failed:", error);
  process.exit(1);
});
