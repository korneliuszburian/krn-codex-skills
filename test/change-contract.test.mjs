import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract, contractSurface, parseChangeContract } from "../scripts/lib/change-contract.mjs";

function makeRoot(scripts = { "test:lessons": "x", "test:lib": "x" }) {
  const root = mkdtempSync(join(tmpdir(), "krn-contract-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  return root;
}

function fakeGit({ commits, files, baseScripts = {}, baseFiles = [] }) {
  return (_root, args) => {
    if (args[0] === "log") {
      return { ok: true, out: commits.map((commit) => `${commit.sha}\u001f${commit.subject}\u001f${commit.body ?? ""}`).join("\u001e") };
    }
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: baseScripts }) };
      return { ok: true, out: (files[last] ?? []).join("\n") };
    }
    if (args[0] === "cat-file") {
      const rel = args[args.length - 1].split(":").slice(1).join(":");
      return { ok: baseFiles.includes(rel), out: "" };
    }
    return { ok: false, out: "" };
  };
}

const green = () => ({ ok: true, status: 0 });

test("contractSurface scopes the harness surfaces", () => {
  assert.equal(contractSurface(["scripts/lib/lessons.mjs"]), true);
  assert.equal(contractSurface(["test/change-contract.test.mjs"]), true);
  assert.equal(contractSurface(["skills/manifest.json"]), true);
  assert.equal(contractSurface(["config/AGENTS.md"]), true);
  assert.equal(contractSurface(["docs/research/workflow-lessons.md"]), false);
});

test("parseChangeContract reads contract direction, at-risk, falsifier, and No-check", () => {
  const parsed = parseChangeContract("feat: x\n\nChange-contract: test:lessons:red->green\nAt-risk: test:lib:green->green\nFalsifier: test/x.test.mjs::probe@abcdef0\n");
  assert.deepEqual(parsed.contracts, [{ ref: "test:lessons", before: "red", after: "green" }]);
  assert.deepEqual(parsed.atRisk, ["test:lib"]);
  assert.deepEqual(parsed.falsifiers, ["test/x.test.mjs::probe@abcdef0"]);
  assert.equal(parseChangeContract("No-check: docs only\n").noCheck, "docs only");
});

test("a surface commit without a contract fails closed", () => {
  const root = makeRoot();
  const git = fakeGit({ commits: [{ sha: "a1", subject: "fix: gate" }], files: { a1: ["scripts/lib/lessons.mjs"] } });
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"));
  rmSync(root, { recursive: true, force: true });
});

test("a non-falsifiable prediction is rejected unless a No-check reason is given", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "Change-contract: test:lessons:green->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git, run: green }).errors.some((error) => error.rule === "non-falsifiable-prediction"));
  const warned = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "Change-contract: test:lessons:green->green\nNo-check: comment-only" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  assert.deepEqual(checkChangeContract({ root, base: "base", git: warned, run: green }).errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("a met prediction passes and an unmet or self-authored one blocks", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  assert.deepEqual(checkChangeContract({ root, base: "base", git, run: green }).errors, []);
  assert.ok(checkChangeContract({ root, base: "base", git, run: () => ({ ok: false, status: 1 }) }).errors.some((error) => error.rule === "unmet-prediction"));
  const selfAuthored = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: {},
  });
  assert.ok(checkChangeContract({ root, base: "base", git: selfAuthored, run: green }).errors.some((error) => error.rule === "self-authorized-check"));
  rmSync(root, { recursive: true, force: true });
});

test("a self-authored test file and a denied ref both block", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "new.test.mjs"), "// probe\n");
  const added = fakeGit({
    commits: [{ sha: "a1", subject: "feat: test", body: "Change-contract: test/new.test.mjs:red->green" }],
    files: { a1: ["test/new.test.mjs"] },
    baseScripts: {},
    baseFiles: [],
  });
  assert.ok(checkChangeContract({ root, base: "base", git: added, run: green }).errors.some((error) => error.rule === "self-authorized-check"));
  const denied = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: changes:check:red->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "changes:check": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: denied, run: green }).errors.some((error) => error.rule === "unknown-check"));
  rmSync(root, { recursive: true, force: true });
});

test("an at-risk regression blocks", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green\nAt-risk: test:lib" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x", "test:lib": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: ({ target }) => ({ ok: target.name !== "test:lib", status: 0 }) });
  assert.ok(report.errors.some((error) => error.rule === "regressed-at-risk"));
  rmSync(root, { recursive: true, force: true });
});

test("the guard disables the CLI check when set in the environment", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-contract-"));
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "krn-codex.mjs"), "changes", "check", "--root", root, "--base", "HEAD", "--head", "HEAD", "--json"], {
    encoding: "utf8",
    env: { ...process.env, KRN_CHANGE_CONTRACT: "0" },
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).skipped, true);
  rmSync(root, { recursive: true, force: true });
});
