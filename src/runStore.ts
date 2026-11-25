import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { detectImageFormat } from "./imageFormat.ts";
import { decide, nextStatus, pickBestAttempt } from "./rules.ts";
import {
  CritiqueResult,
  DEFAULT_APPROVAL_THRESHOLD,
  GenerationInstructions,
  MAX_ATTEMPTS,
  RunHistory,
  type AspectRatio,
  type IterationRecord,
  type ReviewMode,
} from "./schemas.ts";
import { parseWith } from "./json.ts";

const HISTORY_FILE = "history.json";

export class RunStateError extends Error {}

async function readImage(file: string) {
  if (!existsSync(file)) throw new RunStateError(`Image not found: ${file}`);
  const buf = await readFile(file);
  const format = detectImageFormat(buf);
  if (!format) throw new RunStateError(`Not a JPEG, PNG or WebP image: ${file}`);
  return { buf, format };
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "run"
  );
}

async function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

export async function loadHistory(runDir: string): Promise<RunHistory> {
  const file = path.join(runDir, HISTORY_FILE);
  if (!existsSync(file)) throw new RunStateError(`No ${HISTORY_FILE} in ${runDir}`);
  return parseWith(RunHistory, await readFile(file, "utf8"), HISTORY_FILE);
}

export interface CreateRunOptions {
  runsDir: string;
  referenceImage: string;
  description: string;
  aspectRatio: AspectRatio;
  approvalThreshold?: number;
  now?: Date;
}

export async function createRun(opts: CreateRunOptions) {
  const { format } = await readImage(opts.referenceImage);
  const now = opts.now ?? new Date();
  const runId = `${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}_${slug(opts.description)}`;
  const runDir = path.resolve(opts.runsDir, runId);
  if (existsSync(runDir)) throw new RunStateError(`Run already exists: ${runDir}`);
  await mkdir(runDir, { recursive: true });

  const referenceName = `reference.${format}`;
  await copyFile(opts.referenceImage, path.join(runDir, referenceName));

  const history: RunHistory = RunHistory.parse({
    runId,
    createdAt: now.toISOString(),
    brief: { description: opts.description, referenceImage: referenceName, aspectRatio: opts.aspectRatio },
    maxAttempts: MAX_ATTEMPTS,
    approvalThreshold: opts.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD,
    status: "in_progress",
    iterations: [],
    bestAttempt: null,
  });
  await writeJsonAtomic(path.join(runDir, HISTORY_FILE), history);
  return { runId, runDir, referenceImage: path.join(runDir, referenceName), history };
}

export interface RecordOptions {
  runDir: string;
  imagePath: string;
  instructionsText: string;
  critiqueText: string;
  reviewMode: ReviewMode;
  now?: Date;
}

export async function recordIteration(opts: RecordOptions) {
  const history = await loadHistory(opts.runDir);
  if (history.status !== "in_progress") {
    throw new RunStateError(`Run is already finished (status: ${history.status}); no more attempts allowed`);
  }
  const attempt = history.iterations.length + 1;
  if (attempt > history.maxAttempts) {
    throw new RunStateError(`Attempt ${attempt} exceeds the maximum of ${history.maxAttempts}`);
  }

  const instructions = parseWith(GenerationInstructions, opts.instructionsText, "instructions");
  const critique = parseWith(CritiqueResult, opts.critiqueText, "critique");
  const { buf, format } = await readImage(opts.imagePath);

  const imageName = `attempt-${attempt}.${format}`;
  await writeFile(path.join(opts.runDir, imageName), buf);
  await writeJsonAtomic(path.join(opts.runDir, `attempt-${attempt}.instructions.json`), instructions);
  await writeJsonAtomic(path.join(opts.runDir, `attempt-${attempt}.critique.json`), critique);

  const record: IterationRecord = {
    attempt,
    instructions,
    imagePath: imageName,
    sourceImagePath: path.resolve(opts.imagePath),
    reviewMode: opts.reviewMode,
    critique,
    decision: decide(critique, history.approvalThreshold),
    recordedAt: (opts.now ?? new Date()).toISOString(),
  };
  history.iterations.push(record);
  history.status = nextStatus(history);
  history.bestAttempt = pickBestAttempt(history.iterations);
  await writeJsonAtomic(path.join(opts.runDir, HISTORY_FILE), RunHistory.parse(history));
  return { history, record };
}

export type NextAction = "CONTINUE" | "APPROVED" | "MAX_ATTEMPTS_REACHED";

export function nextAction(history: RunHistory): NextAction {
  if (history.status === "approved") return "APPROVED";
  if (history.status === "max_attempts_reached") return "MAX_ATTEMPTS_REACHED";
  return "CONTINUE";
}

/** Compact history for the Art Director so revisions don't reintroduce fixed problems. */
export function directorSummary(history: RunHistory) {
  return {
    brief: history.brief,
    status: history.status,
    nextAttempt: history.status === "in_progress" ? history.iterations.length + 1 : null,
    attemptsLeft: history.maxAttempts - history.iterations.length,
    approvalThreshold: history.approvalThreshold,
    bestAttempt: history.bestAttempt,
    previousAttempts: history.iterations.map((it) => ({
      attempt: it.attempt,
      score: it.critique.qualityScore,
      decision: it.decision,
      prompt: it.instructions.prompt,
      issues: it.critique.issues.map((i) => `[${i.severity}/${i.category}] ${i.description}`),
      suggestedCorrections: it.critique.suggestedCorrections,
    })),
  };
}

export async function finalizeRun(runDir: string, opts: { force?: boolean } = {}) {
  const history = await loadHistory(runDir);
  if (history.status === "in_progress" && !opts.force) {
    throw new RunStateError("Run is still in progress; use --force to finalize early");
  }
  const best = history.iterations.find((i) => i.attempt === history.bestAttempt);
  const rows = history.iterations.map(
    (i) =>
      `| ${i.attempt} | ${i.critique.qualityScore} | ${i.decision} | ${i.reviewMode} | ${i.critique.issues.length} | [${i.imagePath}](${i.imagePath}) |`,
  );
  const md = [
    `# Run ${history.runId}`,
    "",
    `- Description: ${history.brief.description}`,
    `- Reference: [${history.brief.referenceImage}](${history.brief.referenceImage})`,
    `- Status: **${history.status}**`,
    `- Attempts: ${history.iterations.length} of ${history.maxAttempts} (threshold ${history.approvalThreshold})`,
    `- Best attempt: ${best ? `${best.attempt} (score ${best.critique.qualityScore}, ${best.imagePath})` : "none"}`,
    "",
    "| Attempt | Score | Decision | Review mode | Issues | Image |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ];
  if (best) {
    md.push("## Best attempt", "", `![best](${best.imagePath})`, "", "Remaining issues:", "");
    md.push(...best.critique.issues.map((i) => `- [${i.severity}/${i.category}] ${i.description}`), "");
  }
  const summaryPath = path.join(runDir, "summary.md");
  await writeFile(summaryPath, md.join("\n"), "utf8");
  return { history, best, summaryPath };
}
