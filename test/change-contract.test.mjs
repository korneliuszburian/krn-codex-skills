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
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
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
      return { ok: true, out: (files[last] ?? []).join("\0") };
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

test("a surface commit cannot be excused by No-check or a green->green contract", () => {
  const root = makeRoot();
  const nonFalsifiable = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "Change-contract: test:lessons:green->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: nonFalsifiable, run: green }).errors.some((error) => error.rule === "non-falsifiable-prediction"));
  const escaped = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "No-check: whatever\nAt-risk: test:lib" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
    baseScripts: { "test:lessons": "x", "test:lib": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: escaped, run: green }).errors.some((error) => error.rule === "missing-change-contract"), "No-check plus At-risk must not excuse a surface change");
  rmSync(root, { recursive: true, force: true });
});

test("a check added earlier in the same range is self-authored", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "feat: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: {},
  });
  assert.ok(checkChangeContract({ root, base: "base", git, run: green }).errors.some((error) => error.rule === "self-authorized-check"));
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

test("a change that triggers a lesson requires a Recall trailer", () => {
  const root = makeRoot();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `scripts/lib/git-cli.mjs` | | | path:scripts/lib/git-cli.mjs |\n",
  );
  const base = {
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/git-cli.mjs"] },
    baseScripts: { "test:lessons": "x" },
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(base), run: green }).errors.some((error) => error.rule === "unreconstructed-recall"));
  const junk = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: contest:scripts/lib/git-cli.mjs" }],
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(junk), run: green }).errors.some((error) => error.rule === "unreconstructed-recall"), "a superstring must not satisfy the recall");
  const misbound = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/git-cli.mjs => docs/other.md" }],
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(misbound), run: green }).errors.some((error) => error.rule === "unreconstructed-recall"), "the reconstruction target must be a changed file or symbol");
  const recalled = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/git-cli.mjs => scripts/lib/git-cli.mjs" }],
  };
  assert.ok(!checkChangeContract({ root, base: "base", git: fakeGit(recalled), run: green }).errors.some((error) => error.rule === "unreconstructed-recall"));
  rmSync(root, { recursive: true, force: true });
});

test("a symbol trigger requires a Recall trailer", () => {
  const root = makeRoot();
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test:lessons` | | | symbol:runGit |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: sym\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\n" };
      return { ok: true, out: "scripts/lib/git-cli.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "+++ b/scripts/lib/git-cli.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const bare = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green"), run: green });
  assert.ok(bare.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(bare.errors));
  const recalled = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green\nRecall: test:lessons => runGit"), run: green });
  assert.ok(!recalled.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(recalled.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a churn trigger requires a Recall trailer for a hot file", () => {
  const root = makeRoot();
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Fragile | probe | `test:lessons` | | | churn:scripts/lib/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") {
      if (args.includes("--name-only")) return { ok: true, out: "scripts/lib/git-cli.mjs\0scripts/lib/git-cli.mjs\0" };
      return { ok: true, out: `a1\u001ffic: churn\u001f${body}` };
    }
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\n" };
      return { ok: true, out: "scripts/lib/git-cli.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "--- a/scripts/lib/git-cli.mjs\n+++ b/scripts/lib/git-cli.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "rev-list") return { ok: true, out: "2" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const bare = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green"), run: green });
  assert.ok(bare.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(bare.errors));
  const recalled = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green\nRecall: test:lessons => scripts/lib/git-cli.mjs"), run: green });
  assert.ok(!recalled.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(recalled.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson with a testable gate must be exercised by the change", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test/gate.test.mjs` | | | path:scripts/lib/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const recalled = "Change-contract: test:lessons:red->green\nRecall: test/gate.test.mjs => scripts/lib/git-cli.mjs";
  const used = checkChangeContract({ root, base: "base", git: gitFor(recalled), run: green });
  assert.ok(used.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(used.errors));
  const exercised = checkChangeContract({ root, base: "base", git: gitFor(`${recalled}\nAt-risk: test/gate.test.mjs`), run: green });
  assert.ok(!exercised.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(exercised.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a check whose parent manifest is unreadable is rejected as self-authored", () => {
  const root = makeRoot();
  const git = (_root, args) => {
    if (args[0] === "log") return { ok: true, out: "a1\u001ffix\u001fChange-contract: test:lessons:red->green" };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: false, out: "" };
      if (last.includes(":")) return { ok: true, out: "//\n" };
      return { ok: true, out: "scripts/lib/x.mjs" };
    }
    if (args[0] === "rev-parse") return { ok: true, out: ".git" };
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "--- /dev/null\n+++ b/scripts/lib/x.mjs\n@@ -0,0 +1,1 @@\n" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a surface path that git would quote is still checked", () => {
  const root = makeRoot();
  const git = (_root, args) => {
    if (args[0] === "log") return { ok: true, out: "a1\u001ffix\u001f" };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (args.includes("--name-only")) return { ok: true, out: args.includes("-z") ? "scripts/lib/\u00fcber.mjs\0" : '"scripts/lib/\\303\\274ber.mjs"\n' };
      return { ok: true, out: "//\n" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"), JSON.stringify(report.errors));
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
