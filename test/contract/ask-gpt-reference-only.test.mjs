import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("../../skills/advisory/ask-gpt", import.meta.url));
const read = (relative) => readFileSync(join(skill, relative), "utf8");

test("ask-gpt ships no engine: no renderer, no index, no model call", () => {
  assert.ok(!existsSync(join(skill, "scripts")), "ask-gpt must not ship a renderer or index script");
});

test("ask-gpt SKILL.md links every reference and states the no-engine contract", () => {
  const text = read("SKILL.md");
  for (const reference of ["references/prompting-gpt-6-astra.md", "references/chatgpt-capabilities.md", "references/project-setup.md"]) {
    assert.ok(text.includes(reference), `SKILL.md must link ${reference}`);
  }
  for (const needle of ["No scripts", "No browser automation", "advisory evidence"]) {
    assert.ok(text.includes(needle), `SKILL.md must state: ${needle}`);
  }
});

test("the prompting reference carries the six-block contract and the answer schema", () => {
  const reference = read("references/prompting-gpt-6-astra.md");
  for (const heading of ["## Verdict", "## Findings", "## Open questions", "## Non-proofs", "## Next action"]) {
    assert.ok(reference.includes(heading), `the schema must include ${heading}`);
  }
  for (const needle of ["Role and contract", "Fixed point", "Evidence bar", "Output schema", "Questions back", "path:line"]) {
    assert.ok(reference.includes(needle), `the contract must include ${needle}`);
  }
});

test("the capabilities reference states the connector read-only limit and the Codex write path", () => {
  const reference = read("references/chatgpt-capabilities.md");
  assert.match(reference, /read-only/i, "the connector read-only limit must be stated");
  assert.match(reference, /Codex/, "the write path must name Codex");
  assert.match(reference, /pushed commit/, "the connector reads the pushed commit, not the working tree");
});
