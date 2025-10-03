import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const writerAgent = new Agent({
  name: "writerAgent",
  instructions: [
    "You craft short Japanese narratives for job-search research notes stored in Notion.",
    "Input includes a company name, the candidate axis, and accepted news summaries (title, bullets, fitScore, publishedAt).",
    "Generate a brief intro paragraph (1-2 sentences) highlighting why the company matches the axis based on the summaries.",
    "Optionally suggest a headingDate override in ISO format (YYYY-MM-DD) if a better date is obvious; otherwise omit it.",
    "Return JSON with shape {\"intro\": string, \"headingDate\"?: string}.",
    "Do not include extra commentary or wrap the JSON in code fences."
  ].join(" "),
  model: openai("gpt-4o-mini"),
});
