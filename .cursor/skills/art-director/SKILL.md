---
name: art-director
description: Generates and reviews cartoon game assets in a loop using the native GenerateImage tool, an Art Critic review, and the project's `npm run art` scripts. Use when the user asks to run the art director, generate a game asset from a reference image, or start an art-director run.
---

# AI Art Director

You are the **Orchestrator** and the **Art Director**. Generate with the native `GenerateImage` tool, get a critique for every image, and let the `npm run art` scripts decide when to stop.

## Hard rules

- Generate images only with the native `GenerateImage` tool. Never call OpenAI or any other image or vision API.
- Never edit `history.json` or files in the run folder by hand. Only the `npm run art` commands write there (you may write `next.instructions.json` and `next.critique.json`).
- The `NEXT:` line printed by `record` is final. Do not override it, do not exceed 5 attempts, and do not change a critic's verdict.

## Inputs

Ask only for what is missing:
- `REF`: path to the reference image (required).
- `DESC`: what the asset should be (required).
- `ASPECT`: one of `1:1`, `4:3`, `3:4`, `16:9`, `9:16` (default `1:1`).

## Review mode

- If you have a subagent tool (`Task`) that accepts `file_attachments`, use **isolated-subagent**.
- Otherwise (for example in a Cloud Agent), use **self-review**.

## Workflow

Copy and track this checklist:

```
- [ ] Setup: npm install (if node_modules is missing), init run
- [ ] Attempt loop (max 5): direct -> generate -> critique -> record
- [ ] Finalize and report
```

### 1. Setup

```bash
npm install   # only if node_modules/ is missing
npm run -s art -- init --ref "<REF>" --desc "<DESC>" --aspect <ASPECT>
```

Keep `runDir` and `referenceImage` from the JSON output. Open the reference image with Read and study it.

### 2. Direct (Art Director)

Write `<runDir>/next.instructions.json`:

```json
{
  "prompt": "<complete, self-contained image description>",
  "styleNotes": "<style to keep from the reference>",
  "mustInclude": ["<checkable requirement>", "..."],
  "mustAvoid": ["<thing to avoid>", "..."],
  "aspectRatio": "<ASPECT>",
  "changesFromPrevious": []
}
```

- `prompt` must stand alone: subject, pose, style (outline weight, shading, proportions), palette, framing ("full body, nothing cropped, some padding from the edges"), background ("plain solid light-gray background"), and "no text". Do not put perfect centering or equal margins in `mustInclude`; the native generator often ignores exact margin requests, and the critic treats uneven margins as minor polish only.
- Say what to keep from the reference ("the same character from the reference image, identical style and colors") and what changes.
- `mustInclude` and `mustAvoid` come only from `DESC` and the reference, and stay the same for the whole run. The critic grades against them, so adding constraints during revisions moves the target and lowers scores.
- On revisions, first run `npm run -s art -- status --run <runDir>`. Rebuild the prompt from the original brief plus the `suggestedCorrections` from previous attempts; corrections change the `prompt`, not the lists. Start from the best-scoring attempt's prompt, not necessarily the last one. Do not reintroduce issues that were already fixed. List what changed in `changesFromPrevious`.

Validate:

```bash
npm run -s art -- validate --instructions <runDir>/next.instructions.json
```

### 3. Generate

Call `GenerateImage` with:
- `description`: the `prompt`
- `reference_image_paths`: `[<referenceImage>]` (absolute path)
- `aspect_ratio`: `<ASPECT>`
- `filename`: `<runId>-attempt-<N>.png`

Note the path the tool reports. The file may be saved as `.jpg` even if you asked for `.png`; use the real path. If generation fails, adjust the prompt and retry once. Failed generations do not count as attempts.

### 4. Critique (Art Critic)

Read [critic-rubric.md](critic-rubric.md) and fill in `{{DESCRIPTION}}`, `{{MUST_INCLUDE}}`, `{{MUST_AVOID}}` and `{{ASPECT_RATIO}}`.

**isolated-subagent**: Launch a `Task` subagent with `file_attachments: [<referenceImage>, <generated image>]` (in that order). Use the filled rubric as the prompt. Add "Do not use tools; only look at the attached images." Do **not** include your prompt, your reasoning or previous scores.

**self-review**: Open both images with Read. Then forget that you wrote the prompt: judge only what is visible, against the filled rubric, as a strict reviewer. List problems before strengths.

Save the JSON (code fences are fine) to `<runDir>/next.critique.json` and validate it:

```bash
npm run -s art -- validate --critique <runDir>/next.critique.json
```

If it is invalid, re-ask the critic once with the error lines (resume the same subagent in isolated mode).

### 5. Record

```bash
npm run -s art -- record --run <runDir> --image "<generated image path>" --instructions <runDir>/next.instructions.json --critique <runDir>/next.critique.json --review-mode <isolated-subagent|self-review>
```

Read the `NEXT:` line:
- `NEXT: CONTINUE ...`: tell the user the score and the top issues in one line, then go back to step 2.
- `NEXT: APPROVED ...` or `NEXT: MAX_ATTEMPTS_REACHED ...`: go to step 6.

### 6. Finalize and report

```bash
npm run -s art -- finalize --run <runDir>
```

Report to the user in the chat (always show the image; do not only write a path):
- What you ran: REF, DESC, ASPECT, review mode.
- The outcome (approved on attempt N, or the best of 5 if none was approved).
- Show the best image this way (Cloud Agent chat needs the artifacts HTML path; Read alone and markdown links often do not display):
  1. Copy the best attempt file from the run folder to `/opt/cursor/artifacts/` with a short descriptive name (for example `cp <runDir>/attempt-1.jpg /opt/cursor/artifacts/brother-sword-tile.jpg`).
  2. In your chat reply, embed it with an HTML img tag pointing at that artifacts path, for example: `<img src="/opt/cursor/artifacts/brother-sword-tile.jpg" alt="approved tile" />`
  3. Do **not** rely on the **Read** tool alone to display the image, and do **not** use markdown `![...](...)` links.
- A short table: attempt, score, decision, main issue.
- The run folder path.
