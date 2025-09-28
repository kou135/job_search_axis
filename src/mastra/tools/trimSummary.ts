import { SummarySchema, type Summary } from "../../schemas.js";

export interface TrimResult {
  summary: Summary;
  reason?: string;
}

//要約がポリシー制限に収まるようトリムし、再検証した Summary を返す。
//トリム不可能な場合は reason を添えて undefined を返す。
export function trimSummary(
  summary: Summary,
  maxChars: number,
  maxBullets: number
): TrimResult | undefined {
  let bullets = summary.bullets.slice(0, maxBullets);

  const joined = bullets.join("\n");
  if (joined.length > maxChars) {
    const truncated = joined.slice(0, maxChars);
    bullets = truncated.split(/\n/u).map((line) => line.trim()).filter(Boolean);
    if (bullets.length === 0) {
      return {
        summary,
        reason: "文字数制限内に収まらないためトリムできませんでした",
      };
    }
  }

  const trimmed: Summary = {
    ...summary,
    bullets,
    wordCount: [...bullets.join("")].filter((char) => !/\s/u.test(char)).length,
  };

  try {
    const validated = SummarySchema.parse(trimmed);
    return { summary: validated };
  } catch (error) {
    return {
      summary,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
