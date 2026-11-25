import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractJson } from "../src/json.ts";
import { CritiqueResult } from "../src/schemas.ts";

const SKILL_DIR = ".cursor/skills/art-director";
const skill = await readFile(`${SKILL_DIR}/SKILL.md`, "utf8");
const rubric = await readFile(`${SKILL_DIR}/critic-rubric.md`, "utf8");
const cli = await readFile("src/cli.ts", "utf8");

test("skill frontmatter has a valid name and description", () => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(skill.replace(/\r\n/g, "\n"))?.[1] ?? "";
  assert.match(fm, /^name: art-director$/m);
  assert.match(fm, /^description: .{20,1024}$/m);
});

test("every art command and flag used in the skill exists in the CLI", () => {
  const uses = [...skill.matchAll(/npm run -s art -- (\w+)([^\n`]*)/g)];
  assert.ok(uses.length >= 5);
  for (const [, command, rest] of uses) {
    assert.match(cli, new RegExp(`case "${command}"`), `unknown command ${command}`);
    for (const [, flag] of rest!.matchAll(/--([a-z-]+)/g)) {
      assert.ok(cli.includes(`"${flag}"`) || cli.includes(` ${flag}:`), `unknown flag --${flag}`);
    }
  }
});

test("the rubric's example JSON matches the critique schema", () => {
  const block = [...rubric.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  assert.ok(block, "no json example in rubric");
  const r = CritiqueResult.safeParse(extractJson(block));
  assert.equal(r.success, true, JSON.stringify(!r.success && r.error.issues));
});

test("every rubric placeholder is named in the skill", () => {
  const placeholders = new Set([...rubric.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]));
  assert.deepEqual([...placeholders].sort(), ["ASPECT_RATIO", "DESCRIPTION", "MUST_AVOID", "MUST_INCLUDE"]);
  for (const p of placeholders) assert.ok(skill.includes(`{{${p}}}`), `skill does not mention {{${p}}}`);
});
