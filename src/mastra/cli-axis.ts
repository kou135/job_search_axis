import { Command } from "commander";

import { runAxisReader } from "./index.js";

const program = new Command();

program
  .name("axis-reader")
  .description("Wordドキュメントから就活の軸を抽出します")
  .requiredOption("--doc <path>", "DOCX のパス", process.env.OUTPUT_DOCX ?? "./out/JobSearch_KnowledgeBase.docx")
  .option("--companies <names>", "カンマ区切りの会社名一覧", "")
  .option("--limit <number>", "記事取得上限", (value) => Number.parseInt(value, 10), 3)
  .option("--recencyDays <number>", "記事の新しさ（日数）", (value) => Number.parseInt(value, 10), 300)
  .action(async (options) => {
    console.log("[CLI] options:", options);

    const companies = options.companies
      ? String(options.companies)
          .split(",")
          .map((name: string) => name.trim())
          .filter(Boolean)
      : [];

    const result = await runAxisReader({
      docPath: options.doc,
      companies,
      limit: options.limit,
      recencyDays: options.recencyDays,
    });

    console.log(JSON.stringify(result, null, 2));
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
