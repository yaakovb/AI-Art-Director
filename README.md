# AI Art Director

Autonomously generates and evaluates cartoon game assets inside Cursor Agent.

- The Cursor Agent acts as Orchestrator and Art Director.
- Images are generated with Cursor's native image-generation tool.
- An isolated Art Critic subagent compares each generated PNG with the reference image and returns structured JSON.
- The loop repeats until the image is approved or five attempts have been made.

## Usage

In Cursor Agent chat (local or Cloud Agent):

> Run the art-director skill with REF `samples/knight-reference.jpg`, DESC "the same knight jumping with the sword pointed forward, side view", ASPECT 1:1

The workflow lives in [.cursor/skills/art-director/SKILL.md](.cursor/skills/art-director/SKILL.md). Each run is saved to `runs/<runId>/` with every attempt image, its instructions and critique JSON, `history.json` and `summary.md`.

Review modes:
- **isolated-subagent** (local Cursor Agent): a separate critic subagent sees only the two images and the brief.
- **self-review** (Cloud Agent, which has no subagent tool): the same agent reviews against the rubric.

The native image tool always outputs JPEG; images are kept as `.jpg`.

## Development

```bash
npm install
npm run check   # typecheck + tests
npm run art -- <init|validate|record|status|finalize> ...
```
