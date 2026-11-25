import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sampleInstructions, spikeCritique } from "./fixtures.ts";

const exec = promisify(execFile);
const CLI = path.resolve("src/cli.ts");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

async function art(args: string[]) {
  try {
    const { stdout } = await exec(process.execPath, ["--import", "tsx", CLI, ...args]);
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

test("CLI runs a full loop: init, validate, record x2, status, finalize", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "art-cli-"));
  const ref = path.join(dir, "ref.jpg");
  const img = path.join(dir, "gen.jpg");
  const instr = path.join(dir, "instructions.json");
  const rejected = path.join(dir, "rejected.json");
  const approved = path.join(dir, "approved.json");
  await writeFile(ref, JPEG);
  await writeFile(img, JPEG);
  await writeFile(instr, JSON.stringify(sampleInstructions));
  await writeFile(rejected, "```json\n" + JSON.stringify({ ...spikeCritique, approved: false, qualityScore: 62 }) + "\n```");
  await writeFile(approved, JSON.stringify(spikeCritique));

  const init = await art(["init", "--ref", ref, "--desc", "cartoon knight", "--runs-dir", path.join(dir, "runs")]);
  assert.equal(init.code, 0, init.stderr);
  const { runDir } = JSON.parse(init.stdout) as { runDir: string };

  const v = await art(["validate", "--critique", rejected]);
  assert.equal(v.stdout.trim(), "VALID");

  const rec = ["record", "--run", runDir, "--image", img, "--instructions", instr, "--review-mode", "isolated-subagent"];
  const r1 = await art([...rec, "--critique", rejected]);
  assert.match(r1.stdout, /^NEXT: CONTINUE attempt=1 score=62 decision=REJECTED/);

  const status = JSON.parse((await art(["status", "--run", runDir])).stdout) as { nextAttempt: number };
  assert.equal(status.nextAttempt, 2);

  const r2 = await art([...rec, "--critique", approved]);
  assert.match(r2.stdout, /^NEXT: APPROVED attempt=2 score=84 decision=APPROVED best=2/);

  const fin = JSON.parse((await art(["finalize", "--run", runDir])).stdout) as { bestImage: string };
  assert.equal(fin.bestImage, "attempt-2.jpg");
});

test("CLI reports validation errors and usage errors with distinct exit codes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "art-cli-"));
  const bad = path.join(dir, "bad.json");
  await writeFile(bad, JSON.stringify({ ...spikeCritique, qualityScore: 150 }));
  const v = await art(["validate", "--critique", bad]);
  assert.equal(v.code, 1);
  assert.match(v.stderr, /qualityScore/);

  const u = await art(["record", "--run", dir]);
  assert.equal(u.code, 2);
  assert.match(u.stderr, /review-mode/);
});
