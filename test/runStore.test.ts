import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectImageFormat } from "../src/imageFormat.ts";
import { extractJson } from "../src/json.ts";
import {
  RunStateError,
  createRun,
  directorSummary,
  finalizeRun,
  loadHistory,
  nextAction,
  recordIteration,
} from "../src/runStore.ts";
import { sampleInstructions, spikeCritique } from "./fixtures.ts";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "art-director-"));
  const ref = path.join(dir, "ref.png");
  await writeFile(ref, JPEG); // JPEG bytes under a .png name, like the native tool
  const gen = path.join(dir, "generated.png");
  await writeFile(gen, JPEG);
  const run = await createRun({
    runsDir: path.join(dir, "runs"),
    referenceImage: ref,
    description: "Cartoon knight, victory pose!",
    aspectRatio: "1:1",
    now: new Date("2026-11-25T10:00:00Z"),
  });
  return { dir, gen, run };
}

const instructionsText = JSON.stringify(sampleInstructions);
const critique = (score: number, approved: boolean) =>
  JSON.stringify({ ...spikeCritique, qualityScore: score, approved });

test("detects image formats by magic bytes", () => {
  assert.equal(detectImageFormat(JPEG), "jpg");
  assert.equal(detectImageFormat(PNG), "png");
  assert.equal(detectImageFormat(Buffer.from("RIFF0000WEBPVP8 ")), "webp");
  assert.equal(detectImageFormat(Buffer.from("hello world")), null);
});

test("extracts JSON from fenced or prose-wrapped agent output", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Verdict below. {"a":3} Thanks.'), { a: 3 });
  assert.throws(() => extractJson("no json here"));
});

test("createRun makes a run folder with the reference saved under its real format", async () => {
  const { run } = await setup();
  assert.match(run.runId, /^2026-11-25T10-00-00_cartoon-knight-victory-pose$/);
  assert.deepEqual((await readdir(run.runDir)).sort(), ["history.json", "reference.jpg"]);
  const h = await loadHistory(run.runDir);
  assert.equal(h.status, "in_progress");
  assert.equal(h.brief.referenceImage, "reference.jpg");
});

test("createRun rejects a missing or non-image reference", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "art-director-"));
  const txt = path.join(dir, "notes.txt");
  await writeFile(txt, "not an image");
  const base = { runsDir: dir, description: "x", aspectRatio: "1:1" as const };
  await assert.rejects(createRun({ ...base, referenceImage: path.join(dir, "missing.png") }), RunStateError);
  await assert.rejects(createRun({ ...base, referenceImage: txt }), RunStateError);
});

test("records a rejected attempt and continues", async () => {
  const { gen, run } = await setup();
  const { history, record } = await recordIteration({
    runDir: run.runDir,
    imagePath: gen,
    instructionsText,
    critiqueText: critique(65, false),
    reviewMode: "isolated-subagent",
  });
  assert.equal(record.attempt, 1);
  assert.equal(record.decision, "REJECTED");
  assert.equal(record.imagePath, "attempt-1.jpg");
  assert.equal(nextAction(history), "CONTINUE");
  const files = await readdir(run.runDir);
  for (const f of ["attempt-1.jpg", "attempt-1.instructions.json", "attempt-1.critique.json"]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.deepEqual(await readFile(path.join(run.runDir, "attempt-1.jpg")), JPEG);
});

test("stops on approval and refuses further attempts", async () => {
  const { gen, run } = await setup();
  const base = { runDir: run.runDir, imagePath: gen, instructionsText, reviewMode: "self-review" as const };
  await recordIteration({ ...base, critiqueText: critique(60, false) });
  const { history } = await recordIteration({ ...base, critiqueText: critique(88, true) });
  assert.equal(nextAction(history), "APPROVED");
  assert.equal(history.bestAttempt, 2);
  await assert.rejects(recordIteration({ ...base, critiqueText: critique(90, true) }), /already finished/);
});

test("stops after five rejected attempts and picks the highest score", async () => {
  const { gen, run } = await setup();
  const base = { runDir: run.runDir, imagePath: gen, instructionsText, reviewMode: "isolated-subagent" as const };
  const scores = [50, 72, 64, 70, 68];
  let last;
  for (const s of scores) last = await recordIteration({ ...base, critiqueText: critique(s, false) });
  assert.equal(nextAction(last!.history), "MAX_ATTEMPTS_REACHED");
  assert.equal(last!.history.bestAttempt, 2);
  await assert.rejects(recordIteration({ ...base, critiqueText: critique(99, true) }), /already finished/);
});

test("invalid critique is rejected without changing history", async () => {
  const { gen, run } = await setup();
  const bad = JSON.stringify({ ...spikeCritique, issues: [] });
  await assert.rejects(
    recordIteration({ runDir: run.runDir, imagePath: gen, instructionsText, critiqueText: bad, reviewMode: "self-review" }),
    /issues: critic must list at least one issue/,
  );
  assert.equal((await loadHistory(run.runDir)).iterations.length, 0);
  assert.ok(!(await readdir(run.runDir)).includes("attempt-1.jpg"));
});

test("directorSummary lists previous issues and corrections", async () => {
  const { gen, run } = await setup();
  const { history } = await recordIteration({
    runDir: run.runDir,
    imagePath: gen,
    instructionsText,
    critiqueText: critique(65, false),
    reviewMode: "isolated-subagent",
  });
  const s = directorSummary(history);
  assert.equal(s.nextAttempt, 2);
  assert.equal(s.attemptsLeft, 4);
  assert.match(s.previousAttempts[0]!.issues[0]!, /^\[minor\/requirement\]/);
  assert.equal(s.previousAttempts[0]!.suggestedCorrections.length, 2);
});

test("finalize refuses an in-progress run unless forced, then writes summary.md", async () => {
  const { gen, run } = await setup();
  await recordIteration({
    runDir: run.runDir,
    imagePath: gen,
    instructionsText,
    critiqueText: critique(65, false),
    reviewMode: "isolated-subagent",
  });
  await assert.rejects(finalizeRun(run.runDir), /still in progress/);
  const { summaryPath, best } = await finalizeRun(run.runDir, { force: true });
  assert.equal(best?.attempt, 1);
  const md = await readFile(summaryPath, "utf8");
  assert.match(md, /\| 1 \| 65 \| REJECTED \| isolated-subagent \|/);
});
