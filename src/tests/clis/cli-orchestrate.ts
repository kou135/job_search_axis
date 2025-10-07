import { Command } from "commander";

import { mastra } from "../../mastra/index.js";

const WORKFLOW_ID = "jobSearchWorkflow";

const program = new Command();

program
  .name("job-search-orchestrator")
  .description("Axis → Orchestrator → Research → Policy → Writer のワークフローを実行")
  .requiredOption(
    "--root <pageId>",
    "Notion 親ページID",
    process.env.NOTION_ROOT_PAGE_ID
  )
  .option("--limit <number>", "企業ごとの記事取得上限", (value) => Number.parseInt(value, 10), 3)
  .option(
    "--recencyDays <number>",
    "記事の新しさ（日数）",
    (value) => Number.parseInt(value, 10),
    90
  )
  .action(async (options) => {
    console.log("[CLI] options:", options);

    if (!options.root) {
      throw new Error("--root か NOTION_ROOT_PAGE_ID の設定が必要です");
    }

    try {
      const workflow = mastra.getWorkflow(WORKFLOW_ID);
      if (!workflow) {
        throw new Error(`Workflow '${WORKFLOW_ID}' が見つかりません`);
      }

      console.log("[CLI] creating workflow run...");
      const run = await workflow.createRunAsync();

      console.log("[CLI] starting workflow...");
      const result = await run.start({
        inputData: {
          rootPageId: options.root,
          limit: options.limit,
          recencyDays: options.recencyDays,
        },
      });

      if (result.status !== "success") {
        console.error(`[workflow] run ended with status '${result.status}'`);
        if (result.status === "failed") {
          console.error("[workflow] error:", result.error);
        }
        console.error("[workflow] step states:", result.steps);
        return;
      }

      const { qcResults, writerResults } = result.result;

      console.log("[workflow] QC results:");
      for (const qc of qcResults) {
        console.log(`  - ${qc.company}: accepted=${qc.accepted.length}, rejected=${qc.rejected.length}`);
      }

      console.log("[workflow] Writer results:");
      for (const writer of writerResults) {
        console.log(`  - ${writer.company}: written=${writer.written}, pageId=${writer.pageId}`);
      }
    } catch (error) {
      const err = error as { message?: string; stack?: string; cause?: unknown };
      console.error("[CLI] action error object:", err);
      console.error("[CLI] action error message:", err?.message);
      console.error("[CLI] action error stack:\n", err?.stack);
      if (err?.cause) {
        console.error("[CLI] action error cause:", err.cause);
      }
      throw error;
    }
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error("[CLI] error:", error);
    process.exit(1);
  }
}

void main();
