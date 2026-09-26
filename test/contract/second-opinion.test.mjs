import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("../../skills/advisory/second-opinion", import.meta.url));
const read = (relative) => readFileSync(join(skill, relative), "utf8");

test("second-opinion is one bounded advisory owner with a validated runner", () => {
  for (const script of ["scripts/run-opinion.sh", "scripts/check-opinion.sh", "scripts/extract-opinion.mjs"]) {
    assert.ok(existsSync(join(skill, script)), `the runner must ship ${script}`);
  }
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../skills/manifest.json", import.meta.url)), "utf8"));
  const entry = manifest.skills.find((item) => item.name === "second-opinion");
  assert.ok(entry, "second-opinion must be installable");
  assert.equal(entry.implicit, false, "a second opinion is explicit-only");
  for (const retired of ["ask-gpt", "opencode-second-opinion"]) {
    const record = manifest.retired_skills.find((item) => item.name === retired);
    assert.equal(record?.replacement, "second-opinion", `${retired} must retire into the unified owner`);
  }
});

test("second-opinion SKILL.md links every reference and states the advisory contract", () => {
  const text = read("SKILL.md");
  for (const reference of readdirSync(join(skill, "references")).sort()) {
    assert.ok(text.includes(`references/${reference}`), `SKILL.md must link references/${reference}`);
  }
  for (const needle of ["Explicit only", "never an approval", "withhold your own plan"]) {
    assert.ok(text.includes(needle), `SKILL.md must state: ${needle}`);
  }
});

test("the brief standard carries the evidence rules and a template", () => {
  const reference = read("references/brief-standard.md");
  for (const heading of ["## The brief", "## Template", "## Anti-patterns"]) {
    assert.ok(reference.includes(heading), `the standard must include ${heading}`);
  }
  for (const needle of ["One question", "Withhold your plan", "Require one falsifier", "Allow abstention"]) {
    assert.ok(reference.includes(needle), `the standard must state: ${needle}`);
  }
  assert.match(reference, /arxiv\.org/, "the standard must cite primary evidence");
});

test("the transports reference names both families and the run contract", () => {
  const reference = read("references/transports.md");
  for (const needle of ["gpt-6-astra", "gpt-6-sol", "opencode-go/deepseek-v4.1-flash", ".krn/runs/second-opinion"]) {
    assert.ok(reference.includes(needle), `transports must name ${needle}`);
  }
  assert.match(reference, /not a sandbox/, "the transport boundary must disclaim isolation");
});
