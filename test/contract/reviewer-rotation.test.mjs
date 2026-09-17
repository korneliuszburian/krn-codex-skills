import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ORCHESTRATION = "docs/research/orchestration.md";
const LAB_TESTS = "docs/research/lab-tests.md";
const REVIEWER_FAMILIES = ["Codex", "opencode"];
const DIFFERENT_FAMILY = /different[-\s]?(?:model\s)?family|cross-family/i;

function rotationRows(content) {
  return String(content)
    .split("\n")
    .filter((line) => line.startsWith("|") && /harness-surface/i.test(line));
}

export function rotationPolicyErrors(content) {
  const row = rotationRows(content).find(
    (line) => DIFFERENT_FAMILY.test(line) && /review artifact/i.test(line),
  );
  if (!row) {
    return [
      "orchestration: a harness-surface row must require a different-family reviewer and name the review artifact",
    ];
  }
  return REVIEWER_FAMILIES.filter((family) => !row.includes(family)).map(
    (family) => `orchestration: the rotation row must name the reviewer family ${family}`,
  );
}

export function firstRotationRow(content) {
  return String(content)
    .split("\n")
    .find(
      (line) =>
        /^\|\s*LT-\d+\s*\|/.test(line) &&
        /rotation/i.test(line) &&
        DIFFERENT_FAMILY.test(line),
    );
}

export function firstRotationErrors(content) {
  return firstRotationRow(content)
    ? []
    : ["lab-tests: record the first reviewer-rotation instance in an LT row"];
}

test("orchestration mandates a different-family reviewer for harness-surface changes", () => {
  const text = readFileSync(join(root, ORCHESTRATION), "utf8");
  assert.deepEqual(rotationPolicyErrors(text), []);
});

test("the policy observer rejects a page without the rotation mandate", () => {
  assert.deepEqual(rotationPolicyErrors("| Plan-act-observe | adopt | x | y |"), [
    "orchestration: a harness-surface row must require a different-family reviewer and name the review artifact",
  ]);
  const namesTheFamiliesButNoArtifact =
    "| Harness-surface self-changes | adopt | Codex or opencode reviews it | no fleet |";
  assert.deepEqual(rotationPolicyErrors(namesTheFamiliesButNoArtifact), [
    "orchestration: a harness-surface row must require a different-family reviewer and name the review artifact",
  ]);
  const namesTheRuleButNoFamilies =
    "| Harness-surface self-changes | adopt | a different model family reviews it; the review artifact is recorded | no fleet |";
  assert.deepEqual(rotationPolicyErrors(namesTheRuleButNoFamilies), [
    "orchestration: the rotation row must name the reviewer family Codex",
    "orchestration: the rotation row must name the reviewer family opencode",
  ]);
  const complete =
    "| Harness-surface self-changes | adopt | Codex or opencode from a different family; the review artifact is recorded | no fleet |";
  assert.deepEqual(rotationPolicyErrors(complete), []);
});

test("lab-tests records the first reviewer-rotation instance", () => {
  const text = readFileSync(join(root, LAB_TESTS), "utf8");
  assert.deepEqual(firstRotationErrors(text), []);
});

test("the lab-tests observer rejects a page without a rotation row", () => {
  const noRotation = "| LT-1 | claim | form | metric | falsifier | status | result |";
  assert.deepEqual(firstRotationErrors(noRotation), [
    "lab-tests: record the first reviewer-rotation instance in an LT row",
  ]);
  const familyWithoutRotation =
    "| LT-2 | a different model family reviews unrelated changes | form | metric | falsifier | status | result |";
  assert.deepEqual(firstRotationErrors(familyWithoutRotation), [
    "lab-tests: record the first reviewer-rotation instance in an LT row",
  ]);
  const row =
    "| LT-57 | reviewer rotation: a change authored by one family is reviewed by a different model family | form | metric | falsifier | status | result |";
  assert.deepEqual(firstRotationErrors(row), []);
});
