import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract } from "../../scripts/lib/contract/change-contract.mjs";

const LESSONS = "| Lesson | Evidence | Enforced by |\n|---|---|---|\n";
const STABLE = 'import assert from "node:assert/strict";\nimport test from "node:test";\ntest("stable", () => assert.equal(1, 1));\n';
const WIDER = `${STABLE}test("extra", () => assert.equal(2, 2));\n`;
const THING = "export const thing = 1;\n";
const THING_TEST = 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { thing } from "../scripts/lib/thing.mjs";\ntest("thing", () => assert.equal(typeof thing, "number"));\n';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-green-coverage-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => {
    git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A");
    git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message);
  };
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), LESSONS);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: {} })}\n`);
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  git("init", "-q");
  return { root, git, commit };
}

const green = () => ({ ok: true, status: 0, output: "" });
const baseGreen = () => ({ outcome: { ok: true, status: 0, output: "" } });

test("an unrelated passing test cannot seal a behavioral change with green->green", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "scripts", "thing.mjs"), "export const f = () => 1;\n");
  writeFileSync(join(root, "test", "stable.test.mjs"), STABLE);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "scripts", "thing.mjs"), "export const f = () => 2;\n");
  commit("fix: change thing\n\nChange-contract: test/stable.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true, run: green });
  assert.ok(
    report.errors.some((error) => error.rule === "non-falsifiable-prediction" && error.ref === "test/stable.test.mjs"),
    JSON.stringify(report.errors),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a green->green check that changed in the range stays green", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "scripts", "thing.mjs"), "export const f = () => 1;\n");
  writeFileSync(join(root, "test", "stable.test.mjs"), STABLE);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "scripts", "thing.mjs"), "export const f = () => 2;\n");
  writeFileSync(join(root, "test", "stable.test.mjs"), WIDER);
  commit("test: widen\n\nChange-contract: test/stable.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true, run: green, runAtBase: baseGreen });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a green->green check reached from the changed file stays green", () => {
  const { root, git, commit } = fixture();
  writeFileSync(join(root, "scripts", "lib", "thing.mjs"), THING);
  writeFileSync(join(root, "test", "thing.test.mjs"), THING_TEST);
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "scripts", "lib", "thing.mjs"), "export const thing = 1; // tidy\n");
  commit("chore: tidy\n\nChange-contract: test/thing.test.mjs:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true, run: green });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});
