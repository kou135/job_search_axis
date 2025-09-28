import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { runWriterAgent } from "./index.js";
import { QCDecisionSchema } from "../schemas.js";

const program = new Command();

program
  .name("writer-agent")
  .description("QC結果を元に Notion へ要約を追記します")
  .option("--input <json>", "QCDecision(JSON文字列)")
  .option("--inputFile <path>", "QCDecision(JSONファイル)")
  .action(async (options) => {
    const source = await resolveInput(options.input, options.inputFile);
    const decision = QCDecisionSchema.parse(JSON.parse(source));

    const result = await runWriterAgent(decision);
    console.log(JSON.stringify(result, null, 2));
  });

async function resolveInput(inlineValue: string | undefined, filePath: string | undefined) {
  if (filePath) {
    return readFile(filePath, "utf8");
  }
  if (inlineValue) {
    return inlineValue;
  }
  throw new Error("--input か --inputFile のいずれかを指定してください");
}

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error("[CLI] error:", error);
    process.exit(1);
  }
}

void main();
