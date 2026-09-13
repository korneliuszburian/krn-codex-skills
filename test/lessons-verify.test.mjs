import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkLessons } from "../scripts/lib/lessons.mjs";
import { verifyLessons, tapCasePassed } from "../scripts/lib/lessons-verify.mjs";

test("tapCasePassed accepts the exact reporter label and rejects impersonation", () => {
  assert.equal(tapCasePassed("ok 1 - probe\n", "probe"), true);
  assert.equal(tapCasePassed("    ok 1 - probe\n", "probe"), true);
  assert.equal(tapCasePassed("ok 1 - other > probe\n", "probe"), false);
  assert.equal(tapCasePassed("ok 1 - test/x.test.mjs::probe\n", "probe"), false);
  assert.equal(tapCasePassed("ok 1 - other\n", "probe"), false);
  assert.equal(tapCasePassed("not ok 1 - probe\n", "probe"), false);
  assert.equal(tapCasePassed("", "probe"), false);
});

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

test("a malformed lesson page fails verification instead of reporting proof verified", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| broken\n");
  const report = verifyLessons({ root });
  assert.ok(report.errors.length > 0, JSON.stringify(report));
  assert.deepEqual(report.results, []);
  rmSync(root, { recursive: true, force: true });
});

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

test("a case name cannot be impersonated by an unrelated test label", () => {
  const root = makeRoot('import test from "node:test";\ntest("other > probe", () => {});\n');
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail", "a suffix-impersonating label must not count as a pass");
  rmSync(root, { recursive: true, force: true });
});

test("a case name is matched exactly, not as a substring", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe extended", () => {});\n');
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail", "a prefix test must not satisfy the case");
  rmSync(root, { recursive: true, force: true });
});

test("a traversal out of the test directory fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-verify-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "scripts", "x.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `test/../scripts/x.mjs::probe@abcdef0` |\n",
  );
  assert.equal(verifyLessons({ root }).results[0].status, "fail");
  rmSync(root, { recursive: true, force: true });
});

test("the executor does not recurse when the guard is set", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  process.env.KRN_LESSONS_VERIFY = "0";
  try {
    assert.equal(verifyLessons({ root }).skipped, true);
    assert.equal(verifyLessons({ root, force: true }).results[0].status, "pass", "the CLI entrypoint forces execution against ambient env");
  } finally {
    delete process.env.KRN_LESSONS_VERIFY;
  }
  rmSync(root, { recursive: true, force: true });
});

test("a proof outside test/ is rejected and never executed", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-verify-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "scripts", "x.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `scripts/x.mjs::probe@abcdef0` |\n",
  );
  assert.ok(checkLessons({ root }).errors.some((error) => error.includes("executable")), "a non-executable proof is a blocking error");
  assert.equal(verifyLessons({ root }).results[0].status, "fail");
  rmSync(root, { recursive: true, force: true });
});

test("a retired row's proof is not executed", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-verify-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => { throw new Error("boom"); });\n');
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n"
    + "| Old | probe | `scripts/gone.mjs` | | `test/proof.test.mjs::probe@abcdef0` | | retired@abcdef0 |\n",
  );
  const report = verifyLessons({ root });
  assert.deepEqual(report.results, [], "a retired row is archival and not re-run");
  rmSync(root, { recursive: true, force: true });
});
