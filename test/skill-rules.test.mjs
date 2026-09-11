import assert from "node:assert/strict";
import test from "node:test";

import {
  lineLimitErrors,
  openaiYamlErrors,
  skillContentErrors,
  skillPointerErrors,
} from "../scripts/lib/skill-rules.mjs";

const metadata = [
  "interface:",
  '  display_name: "Demo"',
  '  short_description: "A sufficiently long short description here"',
  '  default_prompt: "Use $alpha to do the thing"',
  "policy:",
  "  allow_implicit_invocation: true",
].join("\n");

test("openaiYamlErrors accepts a canonical metadata document", () => {
  assert.deepEqual(
    openaiYamlErrors(metadata, { name: "alpha", implicit: true, skillPath: "skills/engineering/alpha" }),
    [],
  );
  assert.deepEqual(
    openaiYamlErrors("not: canonical", { name: "alpha", implicit: true, skillPath: "p" }),
    ["p: agents/openai.yaml must match the canonical schema"],
  );
  assert.ok(
    openaiYamlErrors(metadata, { name: "alpha", implicit: false, skillPath: "p" }).includes(
      "p: invocation policy differs from manifest",
    ),
  );
  const short = metadata.replace(/short_description: "[^"]+"/, 'short_description: "tiny"');
  assert.ok(
    openaiYamlErrors(short, { name: "alpha", implicit: true, skillPath: "p" }).includes(
      "p: short_description must be 25-64 characters",
    ),
  );
  const wrongPrompt = metadata.replace(/default_prompt: "[^"]+"/, 'default_prompt: "do it"');
  assert.ok(
    openaiYamlErrors(wrongPrompt, { name: "alpha", implicit: true, skillPath: "p" }).includes(
      "p: default_prompt must mention $alpha",
    ),
  );
});

test("skillContentErrors flags forbidden content", () => {
  assert.deepEqual(skillContentErrors("clean body", { skillPath: "p" }), []);
  assert.deepEqual(skillContentErrors("disable-model-invocation", { skillPath: "p" }), [
    "p: Claude-only invocation frontmatter is not canonical",
  ]);
  assert.deepEqual(skillContentErrors("TODO: finish", { skillPath: "p" }), ["p: unresolved scaffold text"]);
  assert.deepEqual(skillContentErrors("[x](../other/SKILL.md)", { skillPath: "p" }), [
    "p: cross-skill relative pointers are not allowed",
  ]);
});

test("skillPointerErrors resolves direct pointers through the injected predicate", () => {
  const content = "[ref](references/notes.md) [script](scripts/run.sh)";
  assert.deepEqual(skillPointerErrors(content, { skillPath: "p", resolveTarget: () => true }), []);
  assert.deepEqual(
    skillPointerErrors(content, {
      skillPath: "p",
      resolveTarget: (kind, rest) => kind === "references" && rest === "notes.md",
    }),
    ["p: broken direct pointer ](scripts/run.sh)"],
  );
});

test("lineLimitErrors reports only over-limit content", () => {
  assert.deepEqual(lineLimitErrors({ label: "a.md", lineCount: 10, max: 10 }), []);
  assert.deepEqual(lineLimitErrors({ label: "a.md", lineCount: 11, max: 10 }), [
    "a.md exceeds 10 lines",
  ]);
  assert.deepEqual(
    lineLimitErrors({ label: "s/SKILL.md", lineCount: 181, max: 180, suffix: "; disclose branch detail" }),
    ["s/SKILL.md exceeds 180 lines; disclose branch detail"],
  );
});
