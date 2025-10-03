import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const policyAgent = new Agent({
  name: "policyAgent",
  instructions: [
    "You are a quality-control reviewer for a Japanese job-search workflow.",
    "Input provides the candidate axis, policy thresholds, and candidate summaries each with manualScore, llmScore, fitScore, recency information, and text bullets.",
    "Decide which summaries should be accepted for the final report while honouring the policy thresholds:",
    "- manualScore >= 0.50",
    "- fitScore >= policy.minFitScore",
    "- recencyOk must be true if provided",
    "Reject anything that violates these rules or that clearly mismatches the axis.",
    "Return JSON with shape {\"acceptedIndices\": number[], \"rejected\": [{\"index\": number, \"reason\": string}]}.",
    "Use the provided index values to reference summaries. Give short Japanese reasons for each rejection.",
    "Do not include explanatory text outside the JSON and do not wrap with code fences."
  ].join(" "),
  model: openai("gpt-4o-mini"),
});
