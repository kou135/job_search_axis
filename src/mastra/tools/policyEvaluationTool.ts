import { createTool } from "@mastra/core/tools";
import { google } from '@ai-sdk/google';
import { AnswerRelevancyMetric } from "@mastra/evals/llm";
import { z } from "zod";

import {
  AxisSchema,
  QCDecisionSchema,
  SummarySchema,
  type QCDecision,
  type PolicyConfig,
} from "../../schemas.js";

const metric = new AnswerRelevancyMetric(google(process.env.GEMINI_MODEL ?? "gemini-flash-latest"), {
  uncertaintyWeight: 0.3,
  scale: 1,
});

const InputSchema = z.object({
  company: z.string(),
  summaries: z.array(SummarySchema),
  axis: AxisSchema,
  policy: z.object({
    maxChars: z.number().int().min(50).max(600).default(200),
    maxBullets: z.number().int().min(1).max(10).default(5),
    minFitScore: z.number().min(0).max(1).default(0.45),
    recencyDays: z.number().int().min(7).max(300).default(90),
    language: z.enum(["ja", "en", "auto"]).default("ja"),
  }),
});

const OutputSchema = QCDecisionSchema;

type PolicyInput = z.infer<typeof InputSchema>;

type ManualScoreConfig = {
  rolesWeight: number;
  industriesWeight: number;
  keywordsWeight: number;
};

const MANUAL_WEIGHTS: ManualScoreConfig = {
  rolesWeight: 0.3,
  industriesWeight: 0.4,
  keywordsWeight: 0.3,
};

const AgentDecisionSchema = z.object({
  acceptedIndices: z.array(z.number().int().min(0)).default([]),
  rejected: z
    .array(
      z.object({
        index: z.number().int().min(0),
        reason: z.string().min(1),
      })
    )
    .default([]),
});

type PolicyAgentDecision = z.infer<typeof AgentDecisionSchema>;

type CandidateForAgent = {
  slot: number;
  summary: z.infer<typeof SummarySchema>;
  manualScore: number;
  llmScore: number;
  llmReason: string;
  recencyOk: boolean;
};

type MastraLike = {
  getAgent?: (name: string) => { generate: (prompt: string) => Promise<{ text?: string | null }> } | undefined;
};

function sectionScore(values: string[] | undefined, weight: number, surface: string): number {
  if (!values || values.length === 0) {
    return 0;
  }
  const perItem = weight / values.length;
  let score = 0;
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (surface.includes(trimmed.toLowerCase())) {
      score += perItem;
    }
  }
  return Math.min(weight, score);
}

function buildSurface(summary: z.infer<typeof SummarySchema>): string {
  return `${summary.title}\n${summary.bullets.join(" \n")}`.toLowerCase();
}

function buildAxisDescription(axis: z.infer<typeof AxisSchema>): string {
  const keywords = axis.keywords && axis.keywords.length > 0 ? axis.keywords.join(", ") : "(なし)";
  return `Roles: ${axis.roles.join(", ")}\nIndustries: ${axis.industries.join(", ")}\nKeywords: ${keywords}`;
}

function isWithinRecency(publishedAt: string | undefined, recencyDays: number): boolean {
  if (!publishedAt) {
    return true;
  }
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) {
    return true;
  }
  const diffMs = Date.now() - published.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= recencyDays;
}

function trimSummary(summary: z.infer<typeof SummarySchema>, policy: PolicyInput["policy"]): z.infer<typeof SummarySchema> | null {
  let bullets = summary.bullets.slice(0, policy.maxBullets);
  let joined = bullets.join("");
  if (joined.length > policy.maxChars) {
    const ratio = policy.maxChars / joined.length;
    bullets = bullets.map((bullet) => bullet.slice(0, Math.max(10, Math.floor(bullet.length * ratio))));
    joined = bullets.join("");
    if (joined.length > policy.maxChars) {
      return null;
    }
  }
  return {
    ...summary,
    bullets,
    wordCount: joined.length,
  } satisfies z.infer<typeof SummarySchema>;
}

async function runPolicyAgent(
  axis: z.infer<typeof AxisSchema>,
  policy: PolicyInput["policy"],
  candidates: CandidateForAgent[],
  mastra: MastraLike | undefined,
): Promise<PolicyAgentDecision | null> {
  if (!mastra?.getAgent) {
    return null;
  }

  const agent = mastra.getAgent("policyAgent");
  if (!agent) {
    return null;
  }

  const payload = candidates.map((candidate) => ({
    index: candidate.slot,
    title: candidate.summary.title,
    url: candidate.summary.url,
    bullets: candidate.summary.bullets,
    fitScore: Number(candidate.summary.fitScore.toFixed(2)),
    manualScore: Number(candidate.manualScore.toFixed(2)),
    llmScore: Number(candidate.llmScore.toFixed(2)),
    recencyOk: candidate.recencyOk,
    publishedAt: candidate.summary.publishedAt ?? null,
    llmReason: candidate.llmReason,
  }));

  const prompt = [
    "You are the policy QC agent. Follow the thresholds strictly.",
    `Axis: ${JSON.stringify(axis)}`,
    `Policy: ${JSON.stringify(policy)}`,
    `Candidates: ${JSON.stringify(payload)}`,
    'Return JSON {"acceptedIndices": number[], "rejected": [{"index": number, "reason": string}]} using the index field to reference candidates.',
    'Accept only if manualScore >= 0.5, fitScore >= policy.minFitScore, and recencyOk is true. Reject otherwise with a short Japanese reason.',
  ].join("\n\n");

  const generation = await agent.generate(prompt);
  const raw = generation.text ?? "{}";
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  return AgentDecisionSchema.parse(JSON.parse(cleaned));
}

export const policyEvaluationTool = createTool({
  id: "policy-evaluation",
  description: "Axis に基づいて要約を受理/却下に分類します",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async execute({ context, mastra }) {
    const { company, summaries, axis, policy } = InputSchema.parse(context);

    const accepted: QCDecision["accepted"] = [];
    const rejected: QCDecision["rejected"] = [];
    const autoRejected: QCDecision["rejected"] = [];
    const axisSurface = buildAxisDescription(axis);

    const candidates: CandidateForAgent[] = [];
    let slot = 0;

    for (const summary of summaries) {
      const trimmed = trimSummary(summary, policy);
      if (!trimmed) {
        autoRejected.push({ summary, reason: "要約を制限内にトリミングできませんでした" });
        continue;
      }

      const surface = buildSurface(trimmed);
      let manualScore = 0;
      manualScore += sectionScore(axis.roles, MANUAL_WEIGHTS.rolesWeight, surface);
      manualScore += sectionScore(axis.industries, MANUAL_WEIGHTS.industriesWeight, surface);
      manualScore += sectionScore(axis.keywords, MANUAL_WEIGHTS.keywordsWeight, surface);
      manualScore = Math.min(1, manualScore);

      let llmScore = 0;
      let llmReason = "";
      try {
        const response = await metric.measure(
          axisSurface,
          `${trimmed.title}\n${trimmed.bullets.join("\n")}`,
        );
        llmScore = response.score;
        llmReason = response.info.reason ?? "";
      } catch (error) {
        console.warn("[PolicyEvaluation] LLM評価に失敗しました:", error);
      }

      candidates.push({
        slot,
        summary: trimmed,
        manualScore,
        llmScore,
        llmReason,
        recencyOk: isWithinRecency(trimmed.publishedAt, policy.recencyDays),
      });
      slot += 1;
    }

    let decision: PolicyAgentDecision | null = null;
    try {
      if (candidates.length > 0) {
        decision = await runPolicyAgent(axis, policy, candidates, mastra);
      }
    } catch (error) {
      console.warn("[PolicyEvaluation] エージェント判定に失敗しました。フォールバックを使用します:", error);
      decision = null;
    }

    if (decision) {
      const acceptedSet = new Set(decision.acceptedIndices);
      const rejectedReasons = new Map<number, string>();
      for (const rej of decision.rejected) {
        rejectedReasons.set(rej.index, rej.reason);
      }

      for (const candidate of candidates) {
        const meetsThresholds =
          candidate.manualScore >= 0.5 &&
          candidate.summary.fitScore >= policy.minFitScore &&
          candidate.recencyOk;

        if (acceptedSet.has(candidate.slot) && meetsThresholds) {
          accepted.push(candidate.summary);
          continue;
        }

        const reasonParts: string[] = [];
        if (candidate.manualScore < 0.5) {
          reasonParts.push(`Manual ${candidate.manualScore.toFixed(2)} < 0.50`);
        }
        if (candidate.summary.fitScore < policy.minFitScore) {
          reasonParts.push(
            `Fit ${candidate.summary.fitScore.toFixed(2)} < Min ${policy.minFitScore.toFixed(2)}`,
          );
        }
        if (!candidate.recencyOk) {
          reasonParts.push("古い記事");
        }

        const agentReason = rejectedReasons.get(candidate.slot);
        const baseReason = reasonParts.length > 0
          ? `ポリシー閾値未達: ${reasonParts.join(" / ")}`
          : agentReason ?? `LLMScore=${candidate.llmScore.toFixed(2)} ${candidate.llmReason}`;

        rejected.push({ summary: candidate.summary, reason: baseReason });
      }
    } else {
      for (const candidate of candidates) {
        const meetsThresholds =
          candidate.manualScore >= 0.5 &&
          candidate.summary.fitScore >= policy.minFitScore &&
          candidate.recencyOk;

        if (meetsThresholds) {
          accepted.push(candidate.summary);
        } else {
          const reasonParts: string[] = [];
          if (candidate.manualScore < 0.5) {
            reasonParts.push(`Manual ${candidate.manualScore.toFixed(2)} < 0.50`);
          }
          if (candidate.summary.fitScore < policy.minFitScore) {
            reasonParts.push(
              `Fit ${candidate.summary.fitScore.toFixed(2)} < Min ${policy.minFitScore.toFixed(2)}`,
            );
          }
          if (!candidate.recencyOk) {
            reasonParts.push("古い記事");
          }
          const fallbackReason =
            reasonParts.length > 0
              ? `ポリシー閾値未達: ${reasonParts.join(" / ")}`
              : `LLMScore=${candidate.llmScore.toFixed(2)} ${candidate.llmReason}`;
          rejected.push({ summary: candidate.summary, reason: fallbackReason });
        }
      }
    }

    for (const auto of autoRejected) {
      rejected.push(auto);
    }

    return OutputSchema.parse({
      company,
      accepted,
      rejected,
    });
  },
});
