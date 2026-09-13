import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  contractBudgetErrors,
  lineLimitErrors,
  openaiYamlErrors,
  referenceLinkErrors,
  skillContentErrors,
  skillIdentityErrors,
  skillLayoutErrors,
  skillPointerErrors,
  skillPromotionErrors,
} from "../../scripts/lib/install/skill-rules.mjs";

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

test("skillLayoutErrors and skillIdentityErrors enforce directory shape", () => {
  const skill = { name: "alpha", path: "skills/engineering/alpha" };
  const root = "/repo";
  const mirror = join(root, "docs", "engineering", "alpha.md");

  const ok = skillLayoutErrors(skill, { root, exists: (p) => p !== mirror });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.present, true);
  assert.equal(ok.skillFile, join(root, "skills/engineering/alpha", "SKILL.md"));

  const mirrored = skillLayoutErrors(skill, { root, exists: () => true });
  assert.deepEqual(mirrored.errors, [
    "docs/engineering/alpha.md: per-skill operator mirrors are forbidden; README must link to canonical SKILL.md",
  ]);

  const missing = skillLayoutErrors(skill, { root, exists: () => false });
  assert.deepEqual(missing.errors, ["skills/engineering/alpha: missing SKILL.md"]);
  assert.equal(missing.present, false);

  assert.deepEqual(
    skillLayoutErrors(skill, {
      root,
      exists: (p) => p !== join(root, "skills/engineering/alpha", "agents", "openai.yaml") && p !== mirror,
    }).errors,
    ["skills/engineering/alpha: missing agents/openai.yaml"],
  );

  assert.deepEqual(skillIdentityErrors({ name: "alpha", description: "ok" }, skill), []);
  assert.deepEqual(skillIdentityErrors({ name: "beta", description: "ok" }, skill), [
    "skills/engineering/alpha: frontmatter name does not match manifest",
  ]);
  assert.deepEqual(skillIdentityErrors({ name: "alpha" }, skill), [
    "skills/engineering/alpha: description must be 1-280 characters",
  ]);
  assert.deepEqual(skillIdentityErrors({ name: "alpha", description: "x".repeat(281) }, skill), [
    "skills/engineering/alpha: description must be 1-280 characters",
  ]);
});

test("referenceLinkErrors requires each reference to be linked", () => {
  const references = ["references/a.md", "references/b.md"];
  assert.deepEqual(
    referenceLinkErrors("see (references/a.md)", { skillPath: "s", references }),
    ["s: references/b.md is not linked directly from SKILL.md"],
  );
  assert.deepEqual(
    referenceLinkErrors("(references/a.md) and (references/b.md)", { skillPath: "s", references }),
    [],
  );
});

test("skillPromotionErrors reconciles discovered and promoted paths", () => {
  assert.deepEqual(
    skillPromotionErrors(new Set(["skills/engineering/alpha"]), new Set(["skills/engineering/alpha"])),
    [],
  );
  assert.deepEqual(
    skillPromotionErrors(new Set(["skills/engineering/ghost"]), new Set(["skills/engineering/alpha"])),
    [
      "skills/engineering/ghost: SKILL.md is not promoted in the manifest",
      "skills/engineering/alpha: manifest path has no SKILL.md",
    ],
  );
});

test("lineLimitErrors reports only over-limit content", () => {
  assert.deepEqual(lineLimitErrors({ label: "a.md", lineCount: 10, max: 10 }), []);
  assert.deepEqual(lineLimitErrors({ label: "a.md", lineCount: 11, max: 10 }), [
    "a.md exceeds 10 lines",
  ]);
});

test("contractBudgetErrors reports over-long lines and words", () => {
  assert.deepEqual(contractBudgetErrors({ label: "x", text: "short line\n", maxLineChars: 10, maxWords: 10 }), []);
  assert.ok(contractBudgetErrors({ label: "x", text: "a".repeat(11), maxLineChars: 10, maxWords: 10 }).some((error) => error.includes("characters")));
  assert.ok(contractBudgetErrors({ label: "x", text: "a b c", maxLineChars: 100, maxWords: 2 }).some((error) => error.includes("words")));
  assert.ok(contractBudgetErrors({ label: "x", text: "a​b​c", maxLineChars: 100, maxWords: 2 }).some((error) => error.includes("words")), "zero-width separators count as boundaries");
  assert.ok(contractBudgetErrors({ label: "x", text: "abcdef", maxLineChars: 100, maxWords: 10, maxChars: 5 }).some((error) => error.includes("characters")), "the character cap fires");
});

test("the always-loaded contract stays within its information budget", () => {
  const text = readFileSync(join("config", "AGENTS.md"), "utf8");
  assert.deepEqual(contractBudgetErrors({ label: "config/AGENTS.md", text, maxLineChars: 320, maxWords: 620, maxChars: 5200 }), []);
});
