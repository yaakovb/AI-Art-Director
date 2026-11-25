import type { CritiqueResult, GenerationInstructions, IterationRecord } from "../src/schemas.ts";

/** Real output from the blind-critic spike (knight reference vs. raised-sword variation). */
export const spikeCritique: CritiqueResult = {
  approved: true,
  qualityScore: 84,
  strengths: [
    "Strong character consistency: helmet shape, red plume, gold crest, chest cross, belt, pouch and shield emblem all match the reference",
    "Art style is faithfully preserved: same bold outlines, cel shading, glossy highlights and chibi proportions",
  ],
  issues: [
    {
      category: "requirement",
      description: "The victory pose is understated: only the sword arm changed.",
      severity: "minor",
    },
    {
      category: "composition",
      description: "The sword tip nearly touches the top edge of the canvas.",
      severity: "minor",
    },
  ],
  suggestedCorrections: [
    "Make the victory pose more dynamic: widen the stance, tilt the torso back slightly",
    "Add padding above the sword tip and center the figure",
  ],
};

export const sampleInstructions: GenerationInstructions = {
  prompt:
    "The same knight character from the reference image raising a silver sword in a victory pose on a plain light-gray background",
  styleNotes: "Chunky chibi proportions, thick dark outlines, flat cel shading",
  mustInclude: ["blue armor with gold trim", "round red shield", "raised silver sword"],
  mustAvoid: ["text", "busy background"],
  aspectRatio: "1:1",
  changesFromPrevious: [],
};

export function makeIteration(
  attempt: number,
  score: number,
  decision: "APPROVED" | "REJECTED",
): IterationRecord {
  return {
    attempt,
    instructions: sampleInstructions,
    imagePath: `attempt-${attempt}.jpg`,
    sourceImagePath: `/opt/cursor/artifacts/assets/attempt-${attempt}.jpg`,
    reviewMode: "isolated-subagent",
    critique: { ...spikeCritique, qualityScore: score, approved: decision === "APPROVED" },
    decision,
    recordedAt: new Date("2026-11-25T10:00:00Z").toISOString(),
  };
}
