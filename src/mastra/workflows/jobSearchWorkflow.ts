import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { AxisSchema, SummarySchema, QCDecisionSchema, PolicyConfigSchema } from "../../schemas.js";
import { axisReaderTool } from "../tools/axisReaderTool.js";
import { orchestratorAgent } from "../agents/orchestratorAgent.js";
import { researchTool } from "../tools/researchTool.js";
import { policyEvaluationTool } from "../tools/policyEvaluationTool.js";
import { notionWriterTool } from "../tools/notionWriterTool.js";

const WorkflowInputSchema = z.object({
  rootPageId: z.string().min(1),
  limit: z.number().int().positive().max(10).default(3),
  recencyDays: z.number().int().positive().max(365).default(90),
});

const AxisStepOutputSchema = z.object({
  rootPageId: z.string(),
  limit: z.number().int().positive(),
  recencyDays: z.number().int().positive(),
  axis: AxisSchema,
});

const CompanyStepOutputSchema = AxisStepOutputSchema.extend({
  companies: z.array(z.string().min(1)).min(1),
  reasoning: z.string().optional(),
});

const ResearchOutputSchema = CompanyStepOutputSchema.extend({
  research: z.array(
    z.object({
      company: z.string(),
      summaries: z.array(SummarySchema),
    })
  ),
});

const PolicyOutputSchema = ResearchOutputSchema.extend({
  qcResults: z.array(QCDecisionSchema),
});

const axisStep = createStep({
  id: "axis-step",
  description: "Notion から Axis を取得",
  inputSchema: WorkflowInputSchema,
  outputSchema: AxisStepOutputSchema,
  async execute({ inputData, runtimeContext }) {
    const axis = await axisReaderTool.execute({
      context: { rootPageId: inputData.rootPageId },
      runtimeContext,
    });
    return {
      rootPageId: inputData.rootPageId,
      limit: inputData.limit,
      recencyDays: inputData.recencyDays,
      axis,
    } satisfies z.infer<typeof AxisStepOutputSchema>;
  },
});

const orchestratorStep = createStep({
  id: "orchestrator-step",
  description: "Axis から企業候補を推定",
  inputSchema: AxisStepOutputSchema,
  outputSchema: CompanyStepOutputSchema,
  async execute({ inputData }) {
    const prompt = [
      "You are assisting a Japanese job seeker.",
      "They provided the following job search axis (roles, industries, keywords).",
      "Suggest up to 5 Japanese technology companies that match this axis and would have enough news coverage to research.",
      `Axis JSON: ${JSON.stringify(inputData.axis)}`,
      `Desired company count: ${inputData.limit}`,
      'Return pure JSON of the form {"companies": ["Company1", "Company2"], "reasoning": "..."}.',
      "Do not include any explanation outside of the JSON."
    ].join(" \n");

    const generation = await orchestratorAgent.generate(prompt);
    const raw = generation.text ?? "{}";
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed: { companies?: string[]; reasoning?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      console.warn("[orchestrator-step] JSON parse failed", error, raw);
      throw new Error("司令塔エージェントの出力が JSON ではありません");
    }

    const companies = Array.isArray(parsed.companies)
      ? parsed.companies.map((c) => String(c).trim()).filter((c) => c.length > 0)
      : [];

    if (companies.length === 0) {
      throw new Error("司令塔エージェントが企業候補を返しませんでした");
    }

    return {
      ...inputData,
      companies,
      reasoning: parsed.reasoning,
    } satisfies z.infer<typeof CompanyStepOutputSchema>;
  },
});

const researchStep = createStep({
  id: "research-step",
  description: "企業ごとのニュース要約を取得",
  inputSchema: CompanyStepOutputSchema,
  outputSchema: ResearchOutputSchema,
  async execute({ inputData, mastra, runtimeContext }) {
    const research = [] as z.infer<typeof ResearchOutputSchema>["research"];
    for (const company of inputData.companies) {
      const result = await researchTool.execute({
        context: {
          request: {
            company,
            limit: inputData.limit,
            recencyDays: inputData.recencyDays,
            axis: inputData.axis,
          },
        },
        mastra,
        runtimeContext,
      });
      research.push(result);
    }

    return {
      ...inputData,
      research,
    } satisfies z.infer<typeof ResearchOutputSchema>;
  },
});

const DEFAULT_POLICY = {
  maxChars: 200,
  maxBullets: 5,
  minFitScore: 0.45,
  recencyDays: 90,
  language: "ja",
} satisfies z.infer<typeof PolicyConfigSchema>;

const policyStep = createStep({
  id: "policy-step",
  description: "要約をポリシー評価",
  inputSchema: ResearchOutputSchema,
  outputSchema: PolicyOutputSchema,
  async execute({ inputData, mastra, runtimeContext }) {
    const qcResults: z.infer<typeof QCDecisionSchema>[] = [];

    for (const item of inputData.research) {
      const decision = await policyEvaluationTool.execute({
        context: {
          company: item.company,
          summaries: item.summaries,
          axis: inputData.axis,
          policy: {
            ...DEFAULT_POLICY,
            recencyDays: inputData.recencyDays,
          },
        },
        mastra,
        runtimeContext,
      });
      qcResults.push(decision);
    }

    return {
      ...inputData,
      qcResults,
    } satisfies z.infer<typeof PolicyOutputSchema>;
  },
});

const writerStep = createStep({
  id: "writer-step",
  description: "受理済み要約を Notion に書き込み",
  inputSchema: PolicyOutputSchema,
  outputSchema: z.object({
    qcResults: z.array(QCDecisionSchema),
    writerResults: z.array(
      z.object({
        company: z.string(),
        written: z.number(),
        pageId: z.string(),
      })
    ),
  }),
  async execute({ inputData, mastra, runtimeContext }) {
    const writerResults: { company: string; written: number; pageId: string }[] = [];

    for (const decision of inputData.qcResults) {
      if (decision.accepted.length === 0) {
        continue;
      }

      const result = await notionWriterTool.execute({
        context: {
          rootPageId: inputData.rootPageId,
          company: decision.company,
          summaries: decision.accepted,
          axis: inputData.axis,
        },
        mastra,
        runtimeContext,
      });
      writerResults.push(result);
    }

    return {
      qcResults: inputData.qcResults,
      writerResults,
    };
  },
});

export const jobSearchWorkflow = createWorkflow({
  id: "job-search-workflow",
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({
    qcResults: z.array(QCDecisionSchema),
    writerResults: z.array(
      z.object({
        company: z.string(),
        written: z.number(),
        pageId: z.string(),
      })
    ),
  }),
  steps: [axisStep, orchestratorStep, researchStep, policyStep, writerStep],
});
