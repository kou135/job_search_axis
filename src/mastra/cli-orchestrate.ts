import { Command } from "commander";

import { orchestrateNotionWorkflow } from "./workflows/Orchestrator.js";

const program = new Command();

program
  .name("orchestrate")
  .description("Axis→Research→Policy→Writer を Notion 上で実行")
  .requiredOption(
    "--root <pageId>",
    "Notion 親ページID",
    process.env.NOTION_ROOT_PAGE_ID
  )
  .requiredOption("--companies <names>", "カンマ区切りの会社名一覧")
  .option("--limit <number>", "記事取得上限", (value) => Number.parseInt(value, 10), 3)
  .option(
    "--recencyDays <number>",
    "記事の新しさ（日数）",
    (value) => Number.parseInt(value, 10),
    180
  )
  .action(async (options) => {
    if (!options.root) {
      throw new Error("--root か NOTION_ROOT_PAGE_ID の設定が必要です");
    }

    const companies = String(options.companies)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    await orchestrateNotionWorkflow({
      rootPageId: options.root,
      companies,
      limit: options.limit,
      recencyDays: options.recencyDays,
    });
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
