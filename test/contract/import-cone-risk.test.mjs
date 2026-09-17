import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkChangeContract } from "../../scripts/lib/contract/change-contract.mjs";

const LESSONS = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
const green = () => ({ ok: true, status: 0, output: "" });
const A = 'export const a = 1;\n';
const B = 'import { a } from "./a.mjs";\nexport const b = a;\n';
const A_TEST = 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { a } from "../scripts/lib/a.mjs";\ntest("a", () => assert.equal(typeof a, "number"));\n';
const B_TEST = 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { b } from "../scripts/lib/b.mjs";\ntest("b", () => assert.equal(typeof b, "number"));\n';

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "krn-import-cone-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => {
    git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A");
    git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message);
  };
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), LESSONS);
  writeFileSync(join(root, "package.json"), '{"scripts":{"test:t":"node --test test/t.test.mjs"}}\n');
  git("init", "-q");
  commit("base");
  return { root, git, base: git("rev-parse", "HEAD").trim() };
}

function withRepo(files, body) {
  const repo = makeRepo(files);
  try {
    body(repo);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
}

function changeModule(repo, rel, content, body) {
  writeFileSync(join(repo.root, rel), content);
  repo.git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A");
  repo.git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", body);
  return checkChangeContract({ root: repo.root, base: repo.base, head: "HEAD", run: green });
}

test("a changed module names no At-risk for its importer's test and is warned", () => {
  withRepo({ "scripts/lib/a.mjs": A, "scripts/lib/b.mjs": B, "test/a.test.mjs": A_TEST, "test/b.test.mjs": B_TEST }, (repo) => {
    const report = changeModule(repo, "scripts/lib/a.mjs", "export const a = 2;\n", "change a\n\nChange-contract: test/a.test.mjs:green->green");
    const warning = report.warnings.find((entry) => entry.rule === "uncovered-importer");
    assert.ok(warning, JSON.stringify(report.warnings));
    assert.equal(warning.ref, "scripts/lib/b.mjs");
    assert.match(warning.detail, /test\/b\.test\.mjs/);
    assert.ok(!report.errors.some((entry) => entry.rule === "uncovered-importer"), JSON.stringify(report.errors));
  });
});

test("naming the importer's test as At-risk is clean", () => {
  withRepo({ "scripts/lib/a.mjs": A, "scripts/lib/b.mjs": B, "test/a.test.mjs": A_TEST, "test/b.test.mjs": B_TEST }, (repo) => {
    const report = changeModule(repo, "scripts/lib/a.mjs", "export const a = 2;\n", "change a\n\nChange-contract: test/a.test.mjs:green->green\nAt-risk: test/b.test.mjs");
    assert.ok(!report.warnings.some((entry) => entry.rule === "uncovered-importer"), JSON.stringify(report.warnings));
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  });
});

test("an importer that no test reaches is silent", () => {
  withRepo({ "scripts/lib/a.mjs": A, "scripts/lib/b.mjs": B, "test/a.test.mjs": A_TEST }, (repo) => {
    const report = changeModule(repo, "scripts/lib/a.mjs", "export const a = 2;\n", "change a\n\nChange-contract: test/a.test.mjs:green->green");
    assert.ok(!report.warnings.some((entry) => entry.rule === "uncovered-importer"), JSON.stringify(report.warnings));
  });
});

test("a dynamic importer's test still resolves", () => {
  const dynamic = 'export const b = (await import("./a.mjs")).a;\n';
  withRepo({ "scripts/lib/a.mjs": A, "scripts/lib/b.mjs": dynamic, "test/a.test.mjs": A_TEST, "test/b.test.mjs": B_TEST }, (repo) => {
    const report = changeModule(repo, "scripts/lib/a.mjs", "export const a = 2;\n", "change a\n\nChange-contract: test/a.test.mjs:green->green");
    const warning = report.warnings.find((entry) => entry.rule === "uncovered-importer");
    assert.ok(warning, JSON.stringify(report.warnings));
    assert.equal(warning.ref, "scripts/lib/b.mjs");
  });
});

test("the changed module's own test does not cover an adjacent importer", () => {
  withRepo({ "scripts/lib/a.mjs": A, "scripts/lib/b.mjs": B, "test/a.test.mjs": A_TEST, "test/b.test.mjs": B_TEST }, (repo) => {
    const report = changeModule(repo, "scripts/lib/a.mjs", "export const a = 2;\n", "change a\n\nChange-contract: test/a.test.mjs:green->green\nAt-risk: test/a.test.mjs");
    assert.ok(report.warnings.some((entry) => entry.rule === "uncovered-importer" && entry.detail.includes("test/b.test.mjs")), JSON.stringify(report.warnings));
  });
});
