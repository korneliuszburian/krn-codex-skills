import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract } from "../../scripts/lib/contract/change-contract.mjs";

const LESSONS = "| Lesson | Evidence | Enforced by |\n|---|---|---|\n";
const IMPORT = 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\n';
const FAILING_CASE = 'test("value is two", () => assert.equal(value, 2));\n';
const PASSING_CASE = 'test("value is a number", () => assert.equal(typeof value, "number"));\n';
const FAILING = `${IMPORT}${FAILING_CASE}`;
const PASSING = `${IMPORT}${PASSING_CASE}`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-green-before-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => {
    git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A");
    git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message);
  };
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), LESSONS);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: {} })}\n`);
  mkdirSync(join(root, "test"), { recursive: true });
  git("init", "-q");
  return { root, git, commit };
}

test("a changed green->green check that is red at base fails before-state-unverified", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), FAILING);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), `// tidy\n${FAILING}`);
  commit("chore: tidy\n\nChange-contract: test/g.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(
    report.errors.some((error) => error.rule === "before-state-unverified"),
    JSON.stringify(report.errors),
  );
  assert.ok(
    report.results.some((result) => result.phase === "base" && result.status === "red"),
    JSON.stringify(report.results),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a green->green check unchanged in the range keeps the fast path", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), FAILING);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2; // tidy\n");
  commit("chore: tidy\n\nChange-contract: test/g.test.mjs:green->green");
  let calls = 0;
  const report = checkChangeContract({
    root,
    base,
    head: "HEAD",
    verifyBefore: true,
    runAtBase: () => { calls += 1; return { unavailable: true }; },
  });
  assert.equal(calls, 0, "an unchanged check must not be base-executed");
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a changed green->green check that stays green at base is admitted", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), FAILING);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2; // tidy\n");
  writeFileSync(join(root, "test", "g.test.mjs"), `${PASSING}${FAILING_CASE}`);
  commit("test: widen\n\nChange-contract: test/g.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.ok(
    report.results.some((result) => result.phase === "base" && result.status === "green"),
    JSON.stringify(report.results),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a changed green->green check that fails to load at base is before-state-unverified", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), FAILING);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "helper.mjs"), "export const helper = 1;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), 'import test from "node:test";\nimport { helper } from "../helper.mjs";\ntest("loads", () => helper);\n');
  commit("chore: tidy\n\nChange-contract: test/g.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(
    report.errors.some((error) => error.rule === "before-state-unverified"),
    JSON.stringify(report.errors),
  );
  rmSync(root, { recursive: true, force: true });
});

test("an at-risk check that changed and is red at base fails before-state-unverified", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "test", "g.test.mjs"), PASSING);
  writeFileSync(join(root, "test", "h.test.mjs"), FAILING);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "h.test.mjs"), `// tidy\n${FAILING}`);
  commit("chore: tidy\n\nChange-contract: test/g.test.mjs:green->green\nAt-risk: test/h.test.mjs");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(
    report.errors.some((error) => error.rule === "before-state-unverified"),
    JSON.stringify(report.errors),
  );
  rmSync(root, { recursive: true, force: true });
});
