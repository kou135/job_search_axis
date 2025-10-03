import { Command } from "commander";

import { mastra } from "../../mastra/index.js";

const WORKFLOW_ID = "job-search-workflow";

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
    if (!options.root) {
      throw new Error("--root か NOTION_ROOT_PAGE_ID の設定が必要です");
    }

    const workflow = mastra.getWorkflow(WORKFLOW_ID);
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        rootPageId: options.root,
        limit: options.limit,
        recencyDays: options.recencyDays,
      },
    });

    console.log("[workflow] QC results:");
    for (const qc of result.output.qcResults) {
      console.log(`  - ${qc.company}: accepted=${qc.accepted.length}, rejected=${qc.rejected.length}`);
    }

    console.log("[workflow] Writer results:");
    for (const writer of result.output.writerResults) {
      console.log(`  - ${writer.company}: written=${writer.written}, pageId=${writer.pageId}`);
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
