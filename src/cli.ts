import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ValidationError, parseWith } from "./json.ts";
import {
  RunStateError,
  createRun,
  directorSummary,
  finalizeRun,
  loadHistory,
  nextAction,
  recordIteration,
} from "./runStore.ts";
import { AspectRatio, CritiqueResult, GenerationInstructions, ReviewMode } from "./schemas.ts";

const USAGE = `Usage: npm run art -- <command> [options]

Commands:
  init      --ref <image> --desc "<text>" [--aspect 1:1] [--threshold 80] [--runs-dir runs]
  validate  (--critique <file> | --instructions <file>)
  record    --run <runDir> --image <file> --instructions <file> --critique <file>
            --review-mode <isolated-subagent|self-review>
  status    --run <runDir>
  finalize  --run <runDir> [--force]`;

function required(values: Record<string, unknown>, name: string): string {
  const v = values[name];
  if (typeof v !== "string" || v.length === 0) throw new UsageError(`Missing --${name}`);
  return v;
}

class UsageError extends Error {}

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      ref: { type: "string" },
      desc: { type: "string" },
      aspect: { type: "string", default: "1:1" },
      threshold: { type: "string" },
      "runs-dir": { type: "string", default: "runs" },
      run: { type: "string" },
      image: { type: "string" },
      instructions: { type: "string" },
      critique: { type: "string" },
      "review-mode": { type: "string" },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });

  switch (command) {
    case "init": {
      const aspect = AspectRatio.safeParse(values.aspect);
      if (!aspect.success) throw new UsageError(`--aspect must be one of ${AspectRatio.options.join(", ")}`);
      const threshold = values.threshold === undefined ? undefined : Number(values.threshold);
      if (threshold !== undefined && !(Number.isInteger(threshold) && threshold >= 0 && threshold <= 100)) {
        throw new UsageError("--threshold must be an integer from 0 to 100");
      }
      const { runId, runDir, referenceImage } = await createRun({
        runsDir: values["runs-dir"]!,
        referenceImage: required(values, "ref"),
        description: required(values, "desc"),
        aspectRatio: aspect.data,
        approvalThreshold: threshold,
      });
      print({ runId, runDir, referenceImage, nextAttempt: 1 });
      return;
    }
    case "validate": {
      if (values.critique) {
        parseWith(CritiqueResult, await readFile(values.critique, "utf8"), "critique");
      } else if (values.instructions) {
        parseWith(GenerationInstructions, await readFile(values.instructions, "utf8"), "instructions");
      } else {
        throw new UsageError("validate needs --critique or --instructions");
      }
      console.log("VALID");
      return;
    }
    case "record": {
      const mode = ReviewMode.safeParse(values["review-mode"]);
      if (!mode.success) throw new UsageError(`--review-mode must be one of ${ReviewMode.options.join(", ")}`);
      const runDir = required(values, "run");
      const { history, record } = await recordIteration({
        runDir,
        imagePath: required(values, "image"),
        instructionsText: await readFile(required(values, "instructions"), "utf8"),
        critiqueText: await readFile(required(values, "critique"), "utf8"),
        reviewMode: mode.data,
      });
      const action = nextAction(history);
      console.log(
        `NEXT: ${action} attempt=${record.attempt} score=${record.critique.qualityScore} decision=${record.decision} best=${history.bestAttempt}`,
      );
      return;
    }
    case "status": {
      print(directorSummary(await loadHistory(required(values, "run"))));
      return;
    }
    case "finalize": {
      const { history, best, summaryPath } = await finalizeRun(required(values, "run"), { force: values.force });
      print({
        status: history.status,
        attempts: history.iterations.length,
        bestAttempt: best?.attempt ?? null,
        bestScore: best?.critique.qualityScore ?? null,
        bestImage: best?.imagePath ?? null,
        summaryPath,
      });
      return;
    }
    default:
      throw new UsageError(command ? `Unknown command: ${command}` : "No command given");
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof UsageError) {
    console.error(`ERROR: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (err instanceof ValidationError || err instanceof RunStateError) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
