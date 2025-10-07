import { z } from "zod";

export const AxisSchema = z
  .object({
    roles: z.array(z.string()).min(1),
    industries: z.array(z.string()).min(1),
    keywords: z.array(z.string()).optional(),
  })
  .strict();
export type Axis = z.infer<typeof AxisSchema>;

export const ResearchRequestSchema = z
  .object({
    company: z.string().min(1),
    limit: z.number().int().positive(),
    recencyDays: z.number().int().positive(),
    axis: AxisSchema,
  })
  .strict();
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

export const ArticleSchema = z
  .object({
    url: z.string().url(),
    title: z.string().min(1),
    text: z.string().min(1),
    publishedAt: z.string().optional(),
  })
  .strict();
export type Article = z.infer<typeof ArticleSchema>;

export const SummarySchema = z
  .object({
    url: z.string().url(),
    title: z.string().min(1),
    bullets: z.array(z.string()).min(1),
    wordCount: z.number().int().min(1),
    publishedAt: z.string().optional(),
    fitScore: z.number().min(0).max(1).optional(),
  })
  .strict();
export type Summary = z.infer<typeof SummarySchema>;

export const PolicyConfigSchema = z
  .object({
    maxChars: z.number().int().min(50).max(600).default(200),
    maxBullets: z.number().int().min(1).max(10).default(5),
    minFitScore: z.number().min(0).max(1).default(0.45),
    recencyDays: z.number().int().min(7).max(300).default(90),
    language: z.enum(["ja", "en", "auto"]).default("ja"),
  })
  .strict();
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const QCDecisionSchema = z
  .object({
    company: z.string(),
    accepted: z.array(SummarySchema),
    rejected: z.array(
      z
        .object({
          summary: SummarySchema,
          reason: z.string(),
        })
        .strict()
    ),
  })
  .strict();
export type QCDecision = z.infer<typeof QCDecisionSchema>;

export type Events = {
  "axis.ready": {
    axis: Axis;
    companies: string[];
    recencyDays: number;
    limit: number;
  };
  "research.request": ResearchRequest;
  "research.result": { company: string; summaries: Summary[] };
  "qc.request": { company: string; summaries: Summary[]; policy: PolicyConfig };
  "qc.result": QCDecision;
  "write.request": QCDecision;
  "write.result": { company: string; written: number; pageId: string };
};
