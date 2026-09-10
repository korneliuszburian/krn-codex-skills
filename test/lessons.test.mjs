import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkLessons } from "../scripts/lib/lessons.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-lessons-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  return root;
}

test("a lesson with a resolving script or manual gate passes", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `test:state` and `manual:review`. |\n");
  const report = checkLessons({ root });
  assert.deepEqual(report.errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("an unresolvable gate reference fails", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `scripts/missing.mjs` |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("no file or npm script")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a lesson without any gate candidate fails", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | review only |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("no resolvable gate")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});
