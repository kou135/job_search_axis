import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";

export const orchestratorAgent = new Agent({
  name: "orchestratorAgent",
  instructions: [
    "You are an assistant that selects Japanese technology companies for job hunting research.",
    "Given a candidate's job search axis (roles, industries, keywords) you must return a JSON object with the following shape:",
    '{"companies": ["Company1", "Company2", ...], "reasoning": "short explanation"}',
    "Choose companies that match the roles and industries as much as possible.",
    "Prefer well known companies that publish enough news coverage (e.g. major tech firms, public startups).",
    "Return between 2 and 5 companies depending on how many relevant matches you can find. Never return an empty list.",
    "Do not include any text before or after the JSON."
  ].join(" "),
  model: google(process.env.GEMINI_MODEL ?? "gemini-flash-latest"),
});
