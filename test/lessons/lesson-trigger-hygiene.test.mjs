import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkLessons } from "../../scripts/lib/lessons/lessons.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

let cached;
function report() {
  if (!cached) cached = checkLessons({ root });
  return cached;
}

const warningsMatching = (pattern) => (report().warnings ?? []).filter((warning) => pattern.test(warning));

test("no lesson trigger is dead", () => {
  const dead = warningsMatching(/dead-trigger/);
  assert.deepEqual(dead, [], JSON.stringify(dead));
});

test("no lesson proof predates later changes to its falsifier or enforcing gate", () => {
  const stale = warningsMatching(/predates later changes/);
  assert.deepEqual(stale, [], JSON.stringify(stale));
});

test("the git-cli lesson is present and no longer dead", () => {
  const row = (report().lessons ?? []).find((lesson) => lesson.lesson.startsWith("Machine-readable git output"));
  assert.ok(row, "the git-cli lesson row is present");
  const dead = warningsMatching(/dead-trigger/).filter((warning) => warning.includes("Machine-readable git output"));
  assert.deepEqual(dead, [], JSON.stringify(dead));
});
