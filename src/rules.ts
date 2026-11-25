import type { CritiqueResult, Decision, IterationRecord, RunHistory, RunStatus } from "./schemas.ts";

export function decide(critique: CritiqueResult, threshold: number): Decision {
  const hasCritical = critique.issues.some((i) => i.severity === "critical");
  return critique.approved && critique.qualityScore >= threshold && !hasCritical
    ? "APPROVED"
    : "REJECTED";
}

export function nextStatus(history: RunHistory): RunStatus {
  const last = history.iterations.at(-1);
  if (last?.decision === "APPROVED") return "approved";
  if (history.iterations.length >= history.maxAttempts) return "max_attempts_reached";
  return "in_progress";
}

/** Prefers an approved attempt; otherwise the highest score, earliest attempt on ties. */
export function pickBestAttempt(iterations: IterationRecord[]): number | null {
  const approved = iterations.find((i) => i.decision === "APPROVED");
  if (approved) return approved.attempt;
  let best: IterationRecord | undefined;
  for (const it of iterations) {
    if (!best || it.critique.qualityScore > best.critique.qualityScore) best = it;
  }
  return best?.attempt ?? null;
}
