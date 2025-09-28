import { Command } from "commander";

import { runPolicyCheck } from "./index.js";
import { SummarySchema, PolicyConfigSchema } from "../schemas.js";

const program = new Command();

program
  .name("policy-check")
  .description("要約とポリシーを評価して受理/却下を判定します")
  .requiredOption("--company <name>", "会社名")
  .requiredOption("--summaries <json>", "要約配列(JSON文字列)")
  .requiredOption("--policy <json>", "ポリシー(JSON文字列)")
  .action(async (options) => {
    const summaries = SummarySchema.array().parse(JSON.parse(options.summaries));
    const policy = PolicyConfigSchema.parse(JSON.parse(options.policy));

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
