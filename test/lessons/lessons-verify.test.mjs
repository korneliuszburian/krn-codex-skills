import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkLessons, recallLessons } from "../../scripts/lib/lessons/lessons.mjs";
import { reanchorLessons, verifyLessons, tapCasePassed } from "../../scripts/lib/lessons/lessons-verify.mjs";

test("tapCasePassed accepts the exact reporter label and rejects impersonation", () => {
  assert.equal(tapCasePassed("ok 1 - probe\n", "probe"), true);
  assert.equal(tapCasePassed("    ok 1 - probe\n", "probe"), true);
  assert.equal(tapCasePassed("ok 1 - probe\\#tag\n", "probe#tag"), true);
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

test("a falsifier whose case names the file path is rejected, not verified", () => {
  const root = makeRoot('import test from "node:test";\n// falsifier label: test/proof.test.mjs\ntest("unrelated", () => {});\n');
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n"
      + "| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `test/proof.test.mjs::test/proof.test.mjs@abcdef0` |\n",
  );
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail");
  assert.match(report.results[0].reason, /not the file path/);
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

test("a failing proof reports the cause", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => { throw new Error("boom-marker"); });\n');
  const report = verifyLessons({ root });
  assert.equal(report.results[0].status, "fail");
  assert.match(report.results[0].detail ?? "", /boom-marker/, JSON.stringify(report.results[0]));
  rmSync(root, { recursive: true, force: true });
});

test("reanchor bumps a stale proof anchor after the case re-runs green", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-reanchor-"));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]).slice(0, 7);
  };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n');
  run(["init", "-q"]);
  const first = commit("one");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | probe | \`test:state\` | | \`test/proof.test.mjs::probe@${first}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n// touched\n');
  const latest = commit("three");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 1, JSON.stringify(report));
  assert.equal(report.updated[0].to, latest);
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.ok(readFileSync(join(root, "docs", "research", "workflow-lessons.md"), "utf8").includes(`probe@${latest}`));
  rmSync(root, { recursive: true, force: true });
});

test("reanchor preserves a case name containing a dollar sign", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-reanchor-dollar-"));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]).slice(0, 7);
  };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("a$&b", () => {});\n');
  run(["init", "-q"]);
  const first = commit("one");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | probe | \`test:state\` | | \`test/proof.test.mjs::a$&b@${first}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("a$&b", () => {});\n// touched\n');
  const latest = commit("three");
  const report = reanchorLessons({ root });
  assert.deepEqual(report.errors, [], JSON.stringify(report));
  assert.ok(readFileSync(join(root, "docs", "research", "workflow-lessons.md"), "utf8").includes(`::a$&b@${latest}`));
  rmSync(root, { recursive: true, force: true });
});

test("reanchor refuses to bump to a red candidate commit", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-reanchor-red-"));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]).slice(0, 7);
  };
  const proof = 'import test from "node:test";\nimport { readFileSync } from "node:fs";\ntest("probe", () => { if (readFileSync(new URL("../flag.txt", import.meta.url), "utf8") !== "green") throw new Error("red"); });\n';
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
  writeFileSync(join(root, "flag.txt"), "red");
  writeFileSync(join(root, "test", "proof.test.mjs"), proof);
  run(["init", "-q"]);
  const first = commit("one");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | probe | \`test:state\` | | \`test/proof.test.mjs::probe@${first}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "proof.test.mjs"), `${proof}// touched\n`);
  commit("three");
  writeFileSync(join(root, "flag.txt"), "green");
  commit("four");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 0, JSON.stringify(report));
  assert.ok(report.skipped.some((entry) => /candidate anchor/.test(entry.reason)), JSON.stringify(report.skipped));
  rmSync(root, { recursive: true, force: true });
});

test("reanchor fixes a gate-file staleness and refuses a dirty tree", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-reanchor-gate-"));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]).slice(0, 7);
  };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n');
  writeFileSync(join(root, "test", "gate.test.mjs"), "// gate v1\n");
  run(["init", "-q"]);
  const first = commit("one");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | probe | \`test/gate.test.mjs\` | | \`test/proof.test.mjs::probe@${first}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "gate.test.mjs"), "// gate v2\n");
  const latest = commit("three");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 1, JSON.stringify(report));
  assert.equal(report.updated[0].to, latest);
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));

  writeFileSync(join(root, "test", "gate.test.mjs"), "// dirty\n");
  const dirty = reanchorLessons({ root });
  assert.equal(dirty.updated.length, 0);
  assert.ok(dirty.skipped.some((entry) => /dirty/.test(entry.reason)), JSON.stringify(dirty.skipped));
  rmSync(root, { recursive: true, force: true });
});

function gitRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]).slice(0, 7);
  };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n');
  run(["init", "-q"]);
  return { root, run, commit };
}

test("reanchor rewrites only the falsifier cell", () => {
  const { root, commit } = gitRoot("krn-reanchor-cell-");
  const first = commit("one");
  const token = `test/proof.test.mjs::probe@${first}`;
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | reruns \`${token}\` | \`test:state\` | | \`${token}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n// touched\n');
  const latest = commit("three");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 1, JSON.stringify(report));
  const page = readFileSync(join(root, "docs", "research", "workflow-lessons.md"), "utf8");
  assert.ok(page.includes(`| reruns \`${token}\` |`), "the evidence cell keeps the old anchor");
  assert.ok(page.includes(`\`test/proof.test.mjs::probe@${latest}\` | | |`), "the falsifier cell is bumped");
  rmSync(root, { recursive: true, force: true });
});

test("reanchor matches a lesson name containing an escaped pipe", () => {
  const { root, commit } = gitRoot("krn-reanchor-pipe-");
  const first = commit("one");
  const token = `test/proof.test.mjs::probe@${first}`;
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A \\| B | probe | \`test:state\` | | \`${token}\` | | |\n`);
  commit("two");
  writeFileSync(join(root, "test", "proof.test.mjs"), 'import test from "node:test";\ntest("probe", () => {});\n// touched\n');
  const latest = commit("three");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 1, JSON.stringify(report));
  assert.ok(readFileSync(join(root, "docs", "research", "workflow-lessons.md"), "utf8").includes(`probe@${latest}`));
  rmSync(root, { recursive: true, force: true });
});

test("an unterminated code fence fails the lesson page", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "```\n| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1 | |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("unterminated code fence")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an invalid trigger glob is a row error, not an abort", () => {
  const root = makeRoot('import test from "node:test";\ntest("probe", () => {});\n');
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1 | | path:[a-Z] |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("invalid trigger glob")), JSON.stringify(report.errors));
  assert.doesNotThrow(() => recallLessons({ root, files: ["scripts/x.mjs"] }));
  rmSync(root, { recursive: true, force: true });
});

test("reanchorLessons blocks when the working-tree status is unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-reanchor-nogit-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
  const report = reanchorLessons({ root });
  assert.equal(report.updated.length, 0, JSON.stringify(report));
  assert.ok(report.skipped.some((entry) => entry.blocking), JSON.stringify(report.skipped));
  rmSync(root, { recursive: true, force: true });
});
