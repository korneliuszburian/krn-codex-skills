import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("a cohesive block is never split solely to satisfy a numeric line budget", () => {
  const skill = read("skills/frontend/frontend-components/SKILL.md");
  assert.match(skill, /Line count is a review signal, never a split trigger or code budget/);
  assert.match(skill, /A cohesive block may exceed 100 lines/);
  assert.doesNotMatch(skill, /IF a block exceeds ~80–100 lines THEN split it/);
  assert.doesNotMatch(skill, /thin skeleton \(≤ ~100 lines\)/);
});

test("heading semantics and visual role are independent architecture choices", () => {
  const skill = read("skills/frontend/frontend-architecture/SKILL.md");
  const consolidation = read("skills/frontend/frontend-architecture/references/consolidation.md");
  const acf = read("skills/frontend/frontend-architecture/references/acf-mapping.md");
  for (const content of [skill, consolidation, acf]) {
    assert.match(content, /semantic heading level/i);
    assert.match(content, /visual role/i);
  }
  assert.doesNotMatch(skill, /heading with H1–H6 size/);
  assert.doesNotMatch(acf, /maps the level to the corresponding token size/);
});

test("tokens govern presentation without pretending structural choices are tokens", () => {
  const skill = read("skills/frontend/frontend-architecture/SKILL.md");
  const acf = read("skills/frontend/frontend-architecture/references/acf-mapping.md");
  assert.match(skill, /Tokens govern presentation values; semantic and structural choices are finite domain options/);
  assert.match(acf, /Tokens govern presentation values, not every editor choice/);
  assert.doesNotMatch(acf, /Every selectable value .* is a token choice/);
});
