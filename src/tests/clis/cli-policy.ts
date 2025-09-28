import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { runPolicyCheck } from "../../mastra/index.js";
import { SummarySchema, PolicyConfigSchema } from "../../schemas.js";

const program = new Command();

async function resolveJsonInput(
  inlineValue: string | undefined,
  filePath: string | undefined,
  label: string
): Promise<string> {
  if (filePath) {
    return readFile(filePath, "utf8");
  }
  if (inlineValue) {
    return inlineValue;
  }
  throw new Error(`--${label} か --${label}File のいずれかを指定してください`);
}

program
  .name("policy-check")
  .description("要約とポリシーを評価して受理/却下を判定します")
  .requiredOption("--company <name>", "会社名")
  .option("--summaries <json>", "要約配列(JSON文字列)")
  .option("--summariesFile <path>", "要約配列(JSONファイル)")
  .option("--policy <json>", "ポリシー(JSON文字列)")
  .option("--policyFile <path>", "ポリシー(JSONファイル)")
  .action(async (options) => {
    const summariesSource = await resolveJsonInput(
      options.summaries,
      options.summariesFile,
      "summaries"
    );
    const policySource = await resolveJsonInput(options.policy, options.policyFile, "policy");

    const summaries = SummarySchema.array().parse(JSON.parse(summariesSource));
    const policy = PolicyConfigSchema.parse(JSON.parse(policySource));

    const result = await runPolicyCheck({
      company: options.company,
      summaries,
      policy,
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
