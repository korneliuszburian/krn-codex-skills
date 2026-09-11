import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyLessons } from "../scripts/lib/lessons-verify.mjs";

function makeRoot(proofSource) {
  const root = mkdtempSync(join(tmpdir(), "krn-verify-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "test", "proof.test.mjs"), proofSource);
  const row = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n"
    + "| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `test/proof.test.mjs::probe@abcdef0` |\n";
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), row);
  return root;
}

test("a passing proof case is executed and reported as pass", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  const report = verifyLessons({ root });
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].status, "pass");
  assert.deepEqual(report.failures, []);
  rmSync(root, { recursive: true, force: true });
});

test("a failing proof case is reported and blocks", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => { throw new Error("boom"); });\n');
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail");
  assert.equal(report.failures.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("a case name that matches no test is not a pass", () => {
  const root = makeRoot('import test from "node:test";\ntest("other", () => {});\n');
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail", "an unmatched pattern must not count as a pass");
  rmSync(root, { recursive: true, force: true });
});

test("the executor does not recurse when the guard is set", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  process.env.KRN_LESSONS_VERIFY = "0";
  try {
    assert.equal(verifyLessons({ root }).skipped, true);
  } finally {
    delete process.env.KRN_LESSONS_VERIFY;
  }
  rmSync(root, { recursive: true, force: true });
});

test("a non-test proof file is skipped, not executed", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-verify-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "scripts", "x.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `scripts/x.mjs::probe@abcdef0` |\n",
  );
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "skipped");
  assert.deepEqual(report.failures, []);
  rmSync(root, { recursive: true, force: true });
});
