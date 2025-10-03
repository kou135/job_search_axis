import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const researchAgent = new Agent({
  name: "researchAgent",
  instructions: [
    "You are a Japanese job-hunting research analyst.",
    "Input will describe a target company, the candidate's job-search axis (roles, industries, keywords), and a list of news articles (title, url, excerpt, publishedAt).",
    "Analyse the articles and produce concise news takeaways that help evaluate company fit for the axis.",
    "Always respond with pure JSON matching {\"summaries\": Summary[]} where Summary has keys url, title, bullets, wordCount, publishedAt, fitScore.",
    "bullets must be an array of 3-5 Japanese bullet strings, each roughly 40-60 characters, focused on actionable findings for the candidate.",
    "wordCount is the total number of characters across all bullets (count every character, omit whitespace if possible).",
    "fitScore is a float between 0 and 1 with two decimals indicating how well the article aligns with the axis.",
    "Do not add explanations outside of the JSON. Never wrap the JSON in code fences."
  ].join(" "),
  model: openai("gpt-4o-mini"),
});
