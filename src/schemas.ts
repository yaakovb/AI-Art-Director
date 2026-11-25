import { z } from "zod";

export const MAX_ATTEMPTS = 5;
export const DEFAULT_APPROVAL_THRESHOLD = 80;

export const AspectRatio = z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]);
export type AspectRatio = z.infer<typeof AspectRatio>;

export const ReviewMode = z.enum(["isolated-subagent", "self-review"]);
export type ReviewMode = z.infer<typeof ReviewMode>;

const nonEmpty = z.string().trim().min(1);

export const GenerationInstructions = z
  .object({
    prompt: z
      .string()
      .trim()
      .refine((s) => s.split(/\s+/).length >= 6, "prompt must be at least 6 words"),
    styleNotes: nonEmpty,
    mustInclude: z.array(nonEmpty).min(1),
    mustAvoid: z.array(nonEmpty),
    aspectRatio: AspectRatio,
    changesFromPrevious: z.array(nonEmpty).default([]),
  })
  .strict();
export type GenerationInstructions = z.infer<typeof GenerationInstructions>;

export const IssueCategory = z.enum([
  "style",
  "anatomy",
  "composition",
  "color",
  "requirement",
  "artifact",
]);

export const Severity = z.enum(["minor", "major", "critical"]);

export const CritiqueIssue = z
  .object({
    category: IssueCategory,
    description: nonEmpty,
    severity: Severity,
  })
  .strict();
export type CritiqueIssue = z.infer<typeof CritiqueIssue>;

export const CritiqueResult = z
  .object({
    approved: z.boolean(),
    qualityScore: z.number().int().min(0).max(100),
    strengths: z.array(nonEmpty),
    issues: z.array(CritiqueIssue).min(1, "critic must list at least one issue"),
    suggestedCorrections: z.array(nonEmpty),
  })
  .strict();
export type CritiqueResult = z.infer<typeof CritiqueResult>;

export const Decision = z.enum(["APPROVED", "REJECTED"]);
export type Decision = z.infer<typeof Decision>;

export const IterationRecord = z
  .object({
    attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
    instructions: GenerationInstructions,
    imagePath: nonEmpty,
    sourceImagePath: nonEmpty,
    reviewMode: ReviewMode,
    critique: CritiqueResult,
    decision: Decision,
    recordedAt: z.string().datetime(),
  })
  .strict();
export type IterationRecord = z.infer<typeof IterationRecord>;

export const RunStatus = z.enum(["in_progress", "approved", "max_attempts_reached"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Brief = z
  .object({
    description: nonEmpty,
    referenceImage: nonEmpty,
    aspectRatio: AspectRatio,
  })
  .strict();
export type Brief = z.infer<typeof Brief>;

export const RunHistory = z
  .object({
    runId: nonEmpty,
    createdAt: z.string().datetime(),
    brief: Brief,
    maxAttempts: z.number().int().min(1).max(MAX_ATTEMPTS),
    approvalThreshold: z.number().int().min(0).max(100),
    status: RunStatus,
    iterations: z.array(IterationRecord),
    bestAttempt: z.number().int().min(1).nullable(),
  })
  .strict();
export type RunHistory = z.infer<typeof RunHistory>;
