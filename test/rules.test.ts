import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, nextStatus, pickBestAttempt } from "../src/rules.ts";
import type { RunHistory } from "../src/schemas.ts";
import { makeIteration, spikeCritique } from "./fixtures.ts";

test("approves when critic approves, score meets threshold, and no critical issues", () => {
  assert.equal(decide(spikeCritique, 80), "APPROVED");
});

test("rejects when the score is below threshold even if the critic approves", () => {
  assert.equal(decide({ ...spikeCritique, qualityScore: 79 }, 80), "REJECTED");
});

test("rejects when the critic does not approve even with a high score", () => {
  assert.equal(decide({ ...spikeCritique, approved: false, qualityScore: 95 }, 80), "REJECTED");
});

test("rejects when any issue is critical", () => {
  const critique = {
    ...spikeCritique,
    issues: [...spikeCritique.issues, { category: "anatomy" as const, description: "Six fingers", severity: "critical" as const }],
  };
  assert.equal(decide(critique, 80), "REJECTED");
});

function history(iterations: RunHistory["iterations"]): RunHistory {
  return {
    runId: "test",
    createdAt: new Date().toISOString(),
    brief: { description: "knight", referenceImage: "reference.jpg", aspectRatio: "1:1" },
    maxAttempts: 5,
    approvalThreshold: 80,
    status: "in_progress",
    iterations,
    bestAttempt: null,
  };
}

test("status stays in progress while attempts remain", () => {
  assert.equal(nextStatus(history([])), "in_progress");
  assert.equal(nextStatus(history([makeIteration(1, 60, "REJECTED")])), "in_progress");
});

test("status becomes approved on an approved attempt", () => {
  const its = [makeIteration(1, 60, "REJECTED"), makeIteration(2, 85, "APPROVED")];
  assert.equal(nextStatus(history(its)), "approved");
});

test("status becomes max_attempts_reached after five rejections", () => {
  const its = [1, 2, 3, 4, 5].map((n) => makeIteration(n, 50 + n, "REJECTED"));
  assert.equal(nextStatus(history(its)), "max_attempts_reached");
});

test("best attempt prefers approved, then highest score, then earliest", () => {
  assert.equal(pickBestAttempt([]), null);
  assert.equal(pickBestAttempt([makeIteration(1, 90, "REJECTED"), makeIteration(2, 82, "APPROVED")]), 2);
  assert.equal(
    pickBestAttempt([makeIteration(1, 70, "REJECTED"), makeIteration(2, 75, "REJECTED"), makeIteration(3, 75, "REJECTED")]),
    2,
  );
});
