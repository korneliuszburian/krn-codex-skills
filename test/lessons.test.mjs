import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkLessons, parseLessons } from "../scripts/lib/lessons.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-lessons-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  return root;
}

test("parseLessons owns the row schema and reports malformed rows", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `manual:review` |\n| B | probe | `test:state` | extra |\n");
  const parsed = parseLessons(file);
  assert.deepEqual(parsed.rows.map((row) => row.lesson), ["A"]);
  assert.equal(parsed.malformed.length, 1);
  rmSync(root, { recursive: true, force: true });
});

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
  assert.ok(report.errors.some((error) => error.includes("no npm script or owned path")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a gate must be an owned path, not a traversal, escape, or directory", () => {
  const root = makeRoot();
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "validate.mjs"), "// gate\n");
  mkdirSync(join(root, "docs", "fakedir.mjs"), { recursive: true });

  const resolveLesson = (gate) => {
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | \`${gate}\` |\n`);
    return checkLessons({ root }).errors;
  };

  assert.ok(resolveLesson("docs/../README.md").length > 0, "traversal to a root file must fail");
  assert.ok(resolveLesson("docs/../../escape.mjs").length > 0, "escape outside the repo must fail");
  assert.ok(resolveLesson("docs/fakedir.mjs").length > 0, "a directory is not a gate file");
  assert.deepEqual(resolveLesson("node scripts/validate.mjs"), [], "an owned node script is a valid gate");
  assert.deepEqual(resolveLesson("node ./scripts/validate.mjs"), [], "a ./ owned node script is a valid gate");
  rmSync(root, { recursive: true, force: true });
});

test("a lesson without any gate candidate fails", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | review only |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("no resolvable gate")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("recurring friction with only a manual gate must be consolidated", () => {
  const root = makeRoot();
  const row = (gate, occurrences) => `| A | probe | \`${gate}\` | ${occurrences} |`;
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences |\n|---|---|---|---|\n${row("manual:review", "2026-01-01@abcdef1, 2026-01-02@abcdef2")}\n`,
  );
  assert.ok(
    checkLessons({ root }).errors.some((error) => error.includes("recurring friction")),
    JSON.stringify(checkLessons({ root }).errors),
  );

  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences |\n|---|---|---|---|\n${row("test:state", "2026-01-01@abcdef1, 2026-01-02@abcdef2")}\n`,
  );
  assert.deepEqual(checkLessons({ root }).errors, []);

  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences |\n|---|---|---|---|\n${row("manual:review", "2026-01-01@abcdef1")}\n`,
  );
  assert.deepEqual(checkLessons({ root }).errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("occurrence tokens must be a date and short commit", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences |\n|---|---|---|---|\n| A | probe | `test:state` | not-a-token |\n");
  assert.equal(parseLessons(file).malformed.length, 1);
  assert.equal(parseLessons(file).rows.length, 0);
  rmSync(root, { recursive: true, force: true });
});
