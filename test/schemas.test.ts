import { test } from "node:test";
import assert from "node:assert/strict";
import { CritiqueResult, GenerationInstructions, IterationRecord } from "../src/schemas.ts";
import { makeIteration, sampleInstructions, spikeCritique } from "./fixtures.ts";

test("accepts the real critique produced by the spike critic", () => {
  assert.equal(CritiqueResult.safeParse(spikeCritique).success, true);
});

test("rejects a critique with no issues", () => {
  const r = CritiqueResult.safeParse({ ...spikeCritique, issues: [] });
  assert.equal(r.success, false);
});

test("rejects out-of-range and non-integer scores", () => {
  for (const qualityScore of [-1, 101, 84.5]) {
    assert.equal(CritiqueResult.safeParse({ ...spikeCritique, qualityScore }).success, false);
  }
});

test("rejects unknown issue categories and severities", () => {
  const badCategory = { ...spikeCritique, issues: [{ category: "lighting", description: "x", severity: "minor" }] };
  const badSeverity = { ...spikeCritique, issues: [{ category: "style", description: "x", severity: "huge" }] };
  assert.equal(CritiqueResult.safeParse(badCategory).success, false);
  assert.equal(CritiqueResult.safeParse(badSeverity).success, false);
});

test("rejects extra keys in a critique", () => {
  assert.equal(CritiqueResult.safeParse({ ...spikeCritique, verdict: "ok" }).success, false);
});

test("accepts valid instructions and defaults changesFromPrevious", () => {
  const { changesFromPrevious: _, ...withoutChanges } = sampleInstructions;
  const r = GenerationInstructions.parse(withoutChanges);
  assert.deepEqual(r.changesFromPrevious, []);
});

test("rejects too-short prompts and unsupported aspect ratios", () => {
  assert.equal(GenerationInstructions.safeParse({ ...sampleInstructions, prompt: "a knight" }).success, false);
  assert.equal(GenerationInstructions.safeParse({ ...sampleInstructions, aspectRatio: "2:1" }).success, false);
});

test("rejects attempt numbers above five", () => {
  assert.equal(IterationRecord.safeParse(makeIteration(5, 70, "REJECTED")).success, true);
  assert.equal(IterationRecord.safeParse(makeIteration(6, 70, "REJECTED")).success, false);
});
