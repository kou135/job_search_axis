import { Command } from "commander";

import { runAxisReader, runResearchAgent } from "./index.js";

const program = new Command();

program
  .name("research-agent")
  .description("会社ごとのニュースを収集して要約を作成します")
  .requiredOption(
    "--doc <path>",
    "AXIS を含む DOCX のパス",
    process.env.OUTPUT_DOCX ?? "./out/JobSearch_KnowledgeBase.docx"
  )
  .requiredOption("--companies <names>", "カンマ区切りの会社名一覧")
  .option("--limit <number>", "記事取得上限", (value) => Number.parseInt(value, 10), 3)
  .option(
    "--recencyDays <number>",
    "記事の新しさ（日数）",
    (value) => Number.parseInt(value, 10),
    300
  )
  .action(async (options) => {
    console.log("[CLI] options:", options);

    const companies = String(options.companies)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    const axisReady = await runAxisReader({
      docPath: options.doc,
      companies,
      limit: options.limit,
      recencyDays: options.recencyDays,
    });

    for (const company of companies) {
      const result = await runResearchAgent({
        company,
        limit: options.limit,
        recencyDays: options.recencyDays,
        axis: axisReady.axis,
      });

      console.log(`\n=== ${company} ===`);
      console.log(JSON.stringify(result, null, 2));
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
