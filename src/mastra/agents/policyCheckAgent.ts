import { addDays } from "date-fns";

import type { Events } from "../../schemas.js";
import {
  SummarySchema,
  type PolicyConfig,
  type Summary,
  type QCDecision,
} from "../../schemas.js";
import { trimSummary } from "../tools/trimSummary.js";
import type { Ctx } from "../context.js";

function isWithinRecency(publishedAt: string | undefined, recencyDays: number): boolean {
  if (!publishedAt) {
    return true;
  }
  const publishedDate = new Date(publishedAt);
  if (Number.isNaN(publishedDate.getTime())) {
    return false;
  }
  const threshold = addDays(new Date(), -recencyDays);
  return publishedDate >= threshold;
}

function evaluateSummary(
  summary: Summary,
  policy: PolicyConfig
): { accepted?: Summary; rejected?: { summary: Summary; reason: string } } {
  try {
    SummarySchema.parse(summary);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "SummarySchema validation failed";
    return { rejected: { summary, reason } };
  }

  if (!isWithinRecency(summary.publishedAt, policy.recencyDays)) {
    return {
      rejected: {
        summary,
        reason: `公開日が許容期間(${policy.recencyDays}日)を超過しています`,
      },
    };
  }

  const trimResult = trimSummary(summary, policy.maxChars, policy.maxBullets);
  if (!trimResult) {
    return {
      rejected: {
        summary,
        reason: "要約を制限内にトリミングできませんでした",
      },
    };
  }

  if (trimResult.reason) {
    return {
      rejected: {
        summary,
        reason: trimResult.reason,
      },
    };
  }

  const trimmed = trimResult.summary;

  if (trimmed.fitScore < policy.minFitScore) {
    return {
      rejected: {
        summary,
        reason: `適合度(${trimmed.fitScore.toFixed(2)})が閾値(${policy.minFitScore})未満です`,
      },
    };
  }

  return { accepted: trimmed };
}

export const policyCheckAgent = {
  name: "PolicyCheckAgent",
  async run(input: Events["qc.request"], ctx: Ctx): Promise<QCDecision> {
    const { company, summaries, policy } = input;

    const accepted: Summary[] = [];
    const rejected: QCDecision["rejected"] = [];

  for (const summary of summaries) {
    const result = evaluateSummary(summary, policy);
    if (result.accepted) {
      accepted.push(result.accepted);
      ctx.log(`[PolicyCheck] accepted summary for ${company}`);
    } else if (result.rejected) {
      rejected.push(result.rejected);
      ctx.log(`[PolicyCheck] rejected summary for ${company}: ${result.rejected.reason}`);
    }
  }

  return {
    company,
    accepted,
    rejected,
  } satisfies QCDecision;
  },
};
