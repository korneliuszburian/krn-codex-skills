import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract, contractGuardActive, contractSurface, frozenNodeArgs, parseChangeContract, runCheckAtBase } from "../../scripts/lib/contract/change-contract.mjs";

function makeRoot(scripts = { "test:lessons": "x", "test:lib": "x" }) {
  const root = mkdtempSync(join(tmpdir(), "krn-contract-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
  return root;
}

function fakeGit({ commits, files, baseScripts = {}, baseFiles = [], blobs = {}, trees = {}, ancestor = true }) {
  return (_root, args) => {
    if (args[0] === "merge-base") {
      return ancestor ? { ok: true, out: "" } : { ok: false, out: "", status: 1 };
    }
    if (args[0] === "log") {
      return { ok: true, out: commits.map((commit) => `${commit.sha}\u001f${commit.subject}\u001f${commit.body ?? ""}`).join("\u001e") };
    }
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: baseScripts }) };
      return { ok: true, out: (files[last] ?? []).join("\0") };
    }
    if (args[0] === "cat-file") {
      const spec = args[args.length - 1];
      const rel = spec.split(":").slice(1).join(":");
      return { ok: baseFiles.includes(rel) || Object.hasOwn(blobs, spec), out: "" };
    }
    if (args[0] === "rev-parse") {
      const key = args[args.length - 1].replace(/\^\{commit\}$/, "");
      return Object.hasOwn(blobs, key) ? { ok: true, out: blobs[key] } : { ok: false, out: "" };
    }
    if (args[0] === "hash-object") {
      const key = `head:${args[args.length - 1]}`;
      return Object.hasOwn(blobs, key) ? { ok: true, out: blobs[key] } : { ok: false, out: "" };
    }
    if (args[0] === "ls-tree") {
      const ref = args[args.length - 1];
      const names = trees[ref] ?? [];
      if (args.includes("-z")) return { ok: true, out: names.join("\0") };
      return { ok: true, out: names.map((name) => (/[^\x00-\x7F]/.test(name) ? `"${name}"` : name)).join("\n") };
    }
    return { ok: false, out: "" };
  };
}

const green = () => ({ ok: true, status: 0 });

test("contractSurface scopes the harness surfaces", () => {
  assert.equal(contractSurface(["scripts/lib/lessons/lessons.mjs"]), true);
  assert.equal(contractSurface(["test/change-contract.test.mjs"]), true);
  assert.equal(contractSurface(["skills/manifest.json"]), true);
  assert.equal(contractSurface(["config/AGENTS.md"]), true);
  assert.equal(contractSurface(["docs/research/workflow-lessons.md"]), true);
  assert.equal(contractSurface(["docs/research/orchestration.md"]), false);
});

test("parseChangeContract reads contract direction and at-risk", () => {
  const parsed = parseChangeContract("feat: x\n\nChange-contract: test:lessons:red->green\nAt-risk: test:lib:green->green\n");
  assert.deepEqual(parsed.contracts, [{ ref: "test:lessons", before: "red", after: "green" }]);
  assert.deepEqual(parsed.atRisk, ["test:lib"]);
});

test("parseChangeContract accepts comma-separated refs and rejects malformed parts", () => {
  const parsed = parseChangeContract("fix: x\n\nChange-contract: test:lessons:red->green, test:lib:red->green\n");
  assert.deepEqual(parsed.contracts, [
    { ref: "test:lessons", before: "red", after: "green" },
    { ref: "test:lib", before: "red", after: "green" },
  ]);
  assert.equal(parseChangeContract("fix: x\n\nChange-contract: bogus\n").contracts.length, 0);
});

test("multiple comma-separated contract refs are all admitted and run", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green, test:lib:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x", "test:lib": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.results.length, 2);
  rmSync(root, { recursive: true, force: true });
});

test("a base that is not an ancestor of head is refused", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    ancestor: false,
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(
    report.errors.some((error) => error.rule === "unreadable-range" && String(error.detail).includes("not an ancestor")),
    JSON.stringify(report.errors),
  );
  rmSync(root, { recursive: true, force: true });
});

test("requireCleanHead refuses a dirty working tree", () => {
  const root = makeRoot();
  const base = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["test/gate.test.mjs"] },
    blobs: { HEAD: "same", alias: "same" },
  });
  const git = (repo, args) => (args[0] === "status" ? { ok: true, out: " M test/gate.test.mjs" } : base(repo, args));
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true, requireCleanHead: true });
  assert.ok(report.errors.some((error) => error.rule === "dirty-tree"), JSON.stringify(report.errors));
  const aliased = checkChangeContract({ root, base: "base", head: "alias", git, run: green, strictRecall: true, requireCleanHead: true });
  assert.ok(aliased.errors.some((error) => error.rule === "dirty-tree"), JSON.stringify(aliased.errors));
  const cleanGit = (repo, args) => (args[0] === "status" ? { ok: true, out: "" } : base(repo, args));
  const cleanReport = checkChangeContract({ root, base: "base", git: cleanGit, run: green, strictRecall: true, requireCleanHead: true });
  assert.ok(!cleanReport.errors.some((error) => error.rule === "dirty-tree" || error.rule === "unreadable-status"), JSON.stringify(cleanReport.errors));
  const unreadable = (repo, args) => (args[0] === "status" ? { ok: false, out: "", status: 128 } : base(repo, args));
  const unreadableReport = checkChangeContract({ root, base: "base", git: unreadable, run: green, strictRecall: true, requireCleanHead: true });
  assert.ok(unreadableReport.errors.some((error) => error.rule === "unreadable-status"), JSON.stringify(unreadableReport.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a malformed part fails the whole contract line closed", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lib:red->green, changes:check" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lib": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("redefining the declared script in the same range is self-authorized", () => {
  const root = makeRoot({ "test:lessons": "true", "test:lib": "x" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "node --test test/lessons.test.mjs" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a declared check with an opaque local launcher is not a literal invocation", () => {
  const root = makeRoot({ "test:lessons": "x", "test:t": "./scripts/run-tests" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:t:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:t": "./scripts/run-tests" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(
    report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("not a literal")),
    JSON.stringify(report.errors),
  );
  rmSync(root, { recursive: true, force: true });
});

test("redefining the declared test file in the same range is self-authorized", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// gate\n");
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test/gate.test.mjs:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseFiles: ["test/gate.test.mjs"],
    blobs: { "base:test/gate.test.mjs": "aaa", "head:test/gate.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an unchanged declared test file is admitted", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// gate\n");
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test/gate.test.mjs:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseFiles: ["test/gate.test.mjs"],
    blobs: { "base:test/gate.test.mjs": "aaa", "head:test/gate.test.mjs": "aaa" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("gutting a test file a declared script runs is self-authorized", () => {
  const root = makeRoot({ "test:lessons": "node --test test/lessons.test.mjs", "test:lib": "x" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "node --test test/lessons.test.mjs" },
    blobs: { "base:test/lessons.test.mjs": "aaa", "head:test/lessons.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("gutting a test reached by an unverifiable glob fails closed", () => {
  const root = makeRoot({ "test:g": "node --test test/*.test.mjs" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:g": "node --test test/*.test.mjs" },
    trees: { base: ["test/a.test.mjs"], HEAD: ["test/a.test.mjs"] },
    blobs: { "base:test/a.test.mjs": "aaa", "head:test/a.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("not a literal")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("gutting a non-ASCII test the declared script runs is self-authorized", () => {
  const root = makeRoot({ "test:u": "node --test test/über.test.mjs" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:u:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:u": "node --test test/über.test.mjs" },
    blobs: { "base:test/über.test.mjs": "aaa", "head:test/über.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("globs with **, ?, and [] fail closed as unverifiable", () => {
  const cases = ["node --test test/**/*.test.mjs", "node --test test/a?.test.mjs", "node --test test/[ab].test.mjs"];
  for (const script of cases) {
    const root = makeRoot({ "test:g": script });
    const git = fakeGit({
      commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
      files: { a1: ["scripts/lib/x.mjs"] },
      baseScripts: { "test:g": script },
      trees: { base: ["test/top.test.mjs"], HEAD: ["test/top.test.mjs"] },
      blobs: { "base:test/top.test.mjs": "aaa", "head:test/top.test.mjs": "bbb" },
    });
    const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
    assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("not a literal")), `${script}: ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("quoted spaced and deleted test files a declared script runs are self-authorized", () => {
  const cases = [
    { script: 'node --test "test/has space.test.mjs"', file: "test/has space.test.mjs", blobs: { "base:test/has space.test.mjs": "aaa", "head:test/has space.test.mjs": "bbb" } },
    { script: "node --test test/a.test.mjs", file: "test/a.test.mjs", blobs: { "base:test/a.test.mjs": "aaa" } },
    { script: "node --test test\\a.test.mjs", file: "test/a.test.mjs", blobs: { "base:test/a.test.mjs": "aaa", "head:test/a.test.mjs": "bbb" } },
  ];
  for (const { script, file, blobs } of cases) {
    const root = makeRoot({ "test:g": script });
    const git = fakeGit({
      commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
      files: { a1: ["scripts/lib/x.mjs"] },
      baseScripts: { "test:g": script },
      trees: { base: [file], HEAD: [file] },
      blobs,
    });
    const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
    assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), `${script}: ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("quoted names with the other quote are caught and metachar names fail closed", () => {
  const cases = [
    { script: `node --test "test/a'b.test.mjs"`, file: "test/a'b.test.mjs" },
    { script: `node --test 'test/a"b.test.mjs'`, file: 'test/a"b.test.mjs' },
    { script: "node --test test/", file: "test/a.test.mjs" },
  ];
  for (const { script, file } of cases) {
    const root = makeRoot({ "test:g": script });
    const git = fakeGit({
      commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
      files: { a1: ["scripts/lib/x.mjs"] },
      baseScripts: { "test:g": script },
      trees: { base: [file], HEAD: [file] },
      blobs: { [`base:${file}`]: "aaa", [`head:${file}`]: "bbb" },
    });
    const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
    assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), `${script}: ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
  const root = makeRoot({ "test:g": `node --test "test/[ab].test.mjs"` });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:g": `node --test "test/[ab].test.mjs"` },
  });
  assert.ok(checkChangeContract({ root, base: "base", git, run: green, strictRecall: true }).errors.some((error) => error.detail.includes("not a literal")), "metachar tokens fail closed");
  rmSync(root, { recursive: true, force: true });
});

test("gutting the entry script a declared check runs is self-authorized", () => {
  const root = makeRoot({ "test:check": "node scripts/check.mjs" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:check:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:check": "node scripts/check.mjs" },
    blobs: { "base:scripts/check.mjs": "aaa", "head:scripts/check.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an npm run chain that reaches a gutted test fails closed as non-literal", () => {
  const scripts = { "test:g": "npm run test:inner", "test:inner": "node --test test/a.test.mjs" };
  const root = makeRoot(scripts);
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: scripts,
    trees: { base: ["test/a.test.mjs"], HEAD: ["test/a.test.mjs"] },
    blobs: { "base:test/a.test.mjs": "aaa", "head:test/a.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("not a literal")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a bare node --test resolves to the default test glob", () => {
  const root = makeRoot({ "test:all": "node --test" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:all:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:all": "node --test" },
    trees: { base: ["test/a.test.mjs"], HEAD: ["test/a.test.mjs"] },
    blobs: { "base:test/a.test.mjs": "aaa", "head:test/a.test.mjs": "bbb" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("shell nesting, variables, and env prefixes fail closed", () => {
  const cases = ['sh -c "node --test test/a.test.mjs"', "bash -c 'node --test test/a.test.mjs'", '/bin/sh -c "node --test test/a.test.mjs"', '/usr/bin/bash -c "node --test test/a.test.mjs"', "sh -e -c \"node --test test/a.test.mjs\"", "dash -c \"node --test test/a.test.mjs\"", "'sh' -c \"node --test test/a.test.mjs\"", "TEST=test/a.test.mjs node --test $TEST", "node --test $PWD/test/a.test.mjs"];
  for (const script of cases) {
    const root = makeRoot({ "test:g": script });
    const git = fakeGit({
      commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
      files: { a1: ["scripts/lib/x.mjs"] },
      baseScripts: { "test:g": script },
      trees: { base: ["test/a.test.mjs"], HEAD: ["test/a.test.mjs"] },
      blobs: { "base:test/a.test.mjs": "aaa", "head:test/a.test.mjs": "bbb" },
    });
    const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
    assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("not a literal")), `${script}: ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unreadable changed-file listing fails closed", () => {
  const root = makeRoot();
  const git = (_root, args) => {
    if (args[0] === "log") return { ok: true, out: "a1\u001ffix\u001fChange-contract: test:lessons:red->green" };
    if (args[0] === "show" && args.includes("--name-only")) return { ok: false, out: "" };
    if (args[0] === "show") return { ok: true, out: "//\n" };
    return { ok: false, out: "" };
  };
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "unreadable-changed-files"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a check predicted red and at-risk green in the same range is a conflict", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:green->red\nAt-risk: test:lessons" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "conflicting-obligations"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("conflicting predictions across commits do not overwrite each other", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [
      { sha: "a1", subject: "fix", body: "Change-contract: test:lessons:green->red" },
      { sha: "a2", subject: "fix again", body: "Change-contract: test:lessons:red->green" },
    ],
    files: { a1: ["scripts/lib/x.mjs"], a2: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
    blobs: {},
  });
  // both commits must list files; fakeGit show returns files for the sha key
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "conflicting-obligations"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a lone green->red contract is not falsifiable compliance", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:green->red" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  const failing = () => ({ ok: false, status: 1 });
  const report = checkChangeContract({ root, base: "base", git, run: failing });
  assert.ok(report.errors.some((error) => error.rule === "non-falsifiable-prediction"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("aliases of one check cannot dodge conflict detection", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green, npm run test:lessons:green->red" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "conflicting-obligations"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("verifyBefore requires the declared check to be red at base", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  const greenBase = checkChangeContract({ root, base: "base", git, run: green, verifyBefore: true, runAtBase: () => ({ outcome: { ok: true } }) });
  assert.ok(greenBase.errors.some((error) => error.rule === "before-state-not-red"), JSON.stringify(greenBase.errors));
  const redBase = checkChangeContract({ root, base: "base", git, run: green, verifyBefore: true, runAtBase: () => ({ outcome: { ok: false } }) });
  assert.ok(!redBase.errors.some((error) => error.rule === "before-state-not-red"), JSON.stringify(redBase.errors));
  const unavailable = checkChangeContract({ root, base: "base", git, run: green, verifyBefore: true, runAtBase: () => ({ unavailable: true }) });
  assert.ok(unavailable.errors.some((error) => error.rule === "before-state-unverified"), JSON.stringify(unavailable.errors));
  const spawnFailed = checkChangeContract({ root, base: "base", git, run: green, verifyBefore: true, runAtBase: () => ({ outcome: { ok: false, spawnFailed: true } }) });
  assert.ok(spawnFailed.errors.some((error) => error.rule === "before-state-unverified"), JSON.stringify(spawnFailed.errors));
  rmSync(root, { recursive: true, force: true });
});

test("runCheckAtBase executes the declared check in a base worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-runcb-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "g.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("g", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("fix");
  const target = { kind: "test", name: "test/g.test.mjs" };
  const atBase = runCheckAtBase({ root, base, target });
  assert.equal(atBase.unavailable, undefined, "the worktree must materialize");
  assert.equal(atBase.outcome.ok, false, "the check is red at base");
  const atHead = runCheckAtBase({ root, base: "HEAD", target });
  assert.equal(atHead.outcome.ok, true, "the check is green at head");
  assert.equal(git("worktree", "list").trim().split("\n").length, 1, "no worktree should leak");
  rmSync(root, { recursive: true, force: true });
});

test("a newly authored observer is admitted only when it is red at base and green at head", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-frozen-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("fix\n\nChange-contract: test/o.test.mjs:red->green");
  const admitted = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.deepEqual(admitted.errors, [], JSON.stringify(admitted.errors));
  assert.ok(admitted.results.some((result) => result.phase === "base" && result.status === "red"), JSON.stringify(admitted.results));
  rmSync(root, { recursive: true, force: true });
});

test("a frozen observer that is green at base or fails to load is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-frozen2-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "green.test.mjs"), 'import test from "node:test";\ntest("always", () => {});\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("green observer\n\nChange-contract: test/green.test.mjs:red->green");
  const green = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(green.errors.some((error) => error.rule === "before-state-not-red"), JSON.stringify(green.errors));
  const base2 = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "broken.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { x } from "../missing.mjs";\ntest("x", () => assert.equal(x, 1));\n');
  writeFileSync(join(root, "missing.mjs"), "export const x = 1;\n");
  commit("broken observer\n\nChange-contract: test/broken.test.mjs:red->green");
  const broken = checkChangeContract({ root, base: base2, head: "HEAD", verifyBefore: true });
  assert.ok(broken.errors.some((error) => error.rule === "before-state-unverified"), JSON.stringify(broken.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a non-frozen base check that fails to load is unverified, not red", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-setup-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "test", "gate.test.mjs"), 'import test from "node:test";\nimport { helper } from "../helper.mjs";\ntest("loads", () => helper);\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "helper.mjs"), "export const helper = 1;\n");
  commit("fix\n\nChange-contract: test/gate.test.mjs:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(report.errors.some((error) => error.rule === "before-state-unverified"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a frozen observer that drops a previously existing case is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-shrink-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("keep", () => assert.equal(typeof value, "number"));\ntest("flip", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("flip", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("fix\n\nChange-contract: test/o.test.mjs:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(report.errors.some((error) => error.rule === "observer-shrinkage"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("shared obligations execute the base check once", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [
      { sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" },
      { sha: "a2", subject: "fix again", body: "Change-contract: test:lessons:red->green" },
    ],
    files: { a1: ["scripts/lib/x.mjs"], a2: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  let calls = 0;
  const report = checkChangeContract({ root, base: "base", git, run: green, verifyBefore: true, runAtBase: () => { calls += 1; return { outcome: { ok: false, output: "not ok 1 - x\n# tests 1\n# fail 1\n" } }; } });
  assert.equal(calls, 1, "the base check runs once for a shared resolved check");
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a shared frozen check executes each overlay once", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [
      { sha: "a1", subject: "fix", body: "Change-contract: test/x.test.mjs:red->green" },
      { sha: "a2", subject: "fix again", body: "Change-contract: test/x.test.mjs:red->green" },
    ],
    files: { a1: ["scripts/lib/x.mjs"], a2: ["scripts/lib/x.mjs"] },
  });
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "x.test.mjs"), "// observer\n");
  let calls = 0;
  const report = checkChangeContract({ root, base: "base", git, run: () => ({ ok: true, status: 0, output: "ok 1 - x\n# tests 1\n# fail 0\n" }), verifyBefore: true, runAtBase: () => { calls += 1; return { outcome: { ok: false, output: "not ok 1 - x\n# tests 1\n# fail 1\n" } }; } });
  assert.equal(calls, 2, "one overlay run plus one base-observer run, reused across the shared check");
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("--before freezes a changed test reached through an unchanged literal script", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-scriptfreeze-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test test/t.test.mjs\"}}\n");
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\ntest("extra", () => assert.equal(typeof value, "number"));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("fix\n\nChange-contract: test:t:red->green");
  const frozen = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.deepEqual(frozen.errors, [], JSON.stringify(frozen.errors));
  const strictAuth = checkChangeContract({ root, base, head: "HEAD", verifyBefore: false });
  assert.ok(strictAuth.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(strictAuth.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a surface commit without a contract fails closed", () => {
  const root = makeRoot();
  const git = fakeGit({ commits: [{ sha: "a1", subject: "fix: gate" }], files: { a1: ["scripts/lib/lessons/lessons.mjs"] } });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"));
  rmSync(root, { recursive: true, force: true });
});

test("a surface commit cannot be excused by No-check or a green->green contract", () => {
  // Policy update (Astra step 3): green->green is now accepted for a
  // behavior-preserving change; No-check is still rejected. The historical case
  // name is kept so the frozen observer does not read this as a dropped case.
  const root = makeRoot();
  const preserved = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "Change-contract: test:lessons:green->green" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git: preserved, run: green, strictRecall: true });
  assert.ok(!report.errors.some((error) => error.rule === "non-falsifiable-prediction"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "unmet-prediction"), JSON.stringify(report.errors));
  const escaped = fakeGit({
    commits: [{ sha: "a1", subject: "chore: tidy", body: "No-check: whatever\nAt-risk: test:lib" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: { "test:lessons": "x", "test:lib": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: escaped, run: green, strictRecall: true }).errors.some((error) => error.rule === "missing-change-contract"), "No-check plus At-risk must not excuse a surface change");
  rmSync(root, { recursive: true, force: true });
});

test("a check added earlier in the same range is self-authored", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "feat: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: {},
  });
  assert.ok(checkChangeContract({ root, base: "base", git, run: green, strictRecall: true }).errors.some((error) => error.rule === "self-authorized-check"));
  rmSync(root, { recursive: true, force: true });
});

test("a met prediction passes and an unmet or self-authored one blocks", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: { "test:lessons": "x" },
  });
  assert.deepEqual(checkChangeContract({ root, base: "base", git, run: green, strictRecall: true }).errors, []);
  assert.ok(checkChangeContract({ root, base: "base", git, run: () => ({ ok: false, status: 1 }) }).errors.some((error) => error.rule === "unmet-prediction"));
  const selfAuthored = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: {},
  });
  assert.ok(checkChangeContract({ root, base: "base", git: selfAuthored, run: green, strictRecall: true }).errors.some((error) => error.rule === "self-authorized-check"));
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
  assert.ok(checkChangeContract({ root, base: "base", git: added, run: green, strictRecall: true }).errors.some((error) => error.rule === "self-authorized-check"));
  const denied = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: changes:check:red->green" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: { "changes:check": "x" },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: denied, run: green, strictRecall: true }).errors.some((error) => error.rule === "unknown-check"));
  rmSync(root, { recursive: true, force: true });
});

test("a plausible but unregistered gate ref is rejected while a registered script passes", () => {
  const root = makeRoot();
  const baseScripts = { "test:lessons": "x", "test:lib": "x" };
  const bad = fakeGit({
    commits: [{ sha: "a1", subject: "fix: state", body: "Change-contract: test:contract:red->green" }],
    files: { a1: ["scripts/lib/state/state-check.mjs"] },
    baseScripts,
  });
  assert.ok(checkChangeContract({ root, base: "base", git: bad, run: green, strictRecall: true }).errors.some((error) => error.rule === "unknown-check"));
  const ok = fakeGit({
    commits: [{ sha: "a1", subject: "fix: state", body: "Change-contract: test:lib:red->green" }],
    files: { a1: ["scripts/lib/state/state-check.mjs"] },
    baseScripts,
  });
  const report = checkChangeContract({ root, base: "base", git: ok, run: green, strictRecall: true });
  assert.ok(!report.errors.some((error) => error.rule === "unknown-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an at-risk regression blocks", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green\nAt-risk: test:lib" }],
    files: { a1: ["scripts/lib/lessons/lessons.mjs"] },
    baseScripts: { "test:lessons": "x", "test:lib": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: ({ target }) => ({ ok: target.name !== "test:lib", status: 0 }) });
  assert.ok(report.errors.some((error) => error.rule === "regressed-at-risk"));
  rmSync(root, { recursive: true, force: true });
});

test("recall enforcement is advisory unless strictRecall is set", () => {
  const root = makeRoot();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | \`test:state\` | | | path:scripts/lib/x.mjs |\n");
  const git = fakeGit({ commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lessons:red->green" }], files: { a1: ["scripts/lib/x.mjs"] }, baseScripts: { "test:lessons": "x" }, blobs: { "base:test/lessons.test.mjs": "aaa", "head:test/lessons.test.mjs": "aaa" } });
  const advisory = checkChangeContract({ root, base: "base", git, run: green, strictRecall: false });
  assert.ok(advisory.warnings.some((entry) => entry.rule === "unreconstructed-recall"), JSON.stringify(advisory.warnings));
  assert.ok(!advisory.errors.some((entry) => entry.rule === "unreconstructed-recall"), JSON.stringify(advisory.errors));
  const strict = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(strict.errors.some((entry) => entry.rule === "unreconstructed-recall"), JSON.stringify(strict.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a change that triggers a lesson requires a Recall trailer", () => {
  const root = makeRoot();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `scripts/lib/support/git-cli.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const base = {
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/support/git-cli.mjs"] },
    baseScripts: { "test:lessons": "x" },
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(base), run: green, strictRecall: true }).errors.some((error) => error.rule === "unreconstructed-recall"));
  const junk = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/support/git-cli.mjs => contest:scripts/lib/support/git-cli.mjs" }],
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(junk), run: green, strictRecall: true }).errors.some((error) => error.rule === "unreconstructed-recall"), "a superstring must not satisfy the recall");
  const suffixed = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/support/git-cli.mjs => scripts/lib/support/git-cli.mjs.bak" }],
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(suffixed), run: green, strictRecall: true }).errors.some((error) => error.rule === "unreconstructed-recall"), "a suffixed target must not satisfy the recall");
  const misbound = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/support/git-cli.mjs => docs/other.md" }],
  };
  assert.ok(checkChangeContract({ root, base: "base", git: fakeGit(misbound), run: green, strictRecall: true }).errors.some((error) => error.rule === "unreconstructed-recall"), "the reconstruction target must be a changed file or symbol");
  const recalled = {
    ...base,
    commits: [{ sha: "a1", subject: "fix: cli", body: "Change-contract: test:lessons:red->green\nRecall: scripts/lib/support/git-cli.mjs => scripts/lib/support/git-cli.mjs" }],
  };
  assert.ok(!checkChangeContract({ root, base: "base", git: fakeGit(recalled), run: green, strictRecall: true }).errors.some((error) => error.rule === "unreconstructed-recall"));
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
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "+++ b/scripts/lib/support/git-cli.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const bare = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green"), run: green, strictRecall: true });
  assert.ok(bare.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(bare.errors));
  const recalled = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green\nRecall: test:lessons => runGit"), run: green, strictRecall: true });
  assert.ok(!recalled.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(recalled.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a churn trigger requires a Recall trailer for a hot file", () => {
  const root = makeRoot();
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Fragile | probe | `test:lessons` | | | churn:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") {
      if (args.includes("--name-only")) return { ok: true, out: "scripts/lib/support/git-cli.mjs\0scripts/lib/support/git-cli.mjs\0" };
      return { ok: true, out: `a1\u001ffic: churn\u001f${body}` };
    }
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "--- a/scripts/lib/support/git-cli.mjs\n+++ b/scripts/lib/support/git-cli.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "rev-list") return { ok: true, out: "2" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const bare = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green"), run: green, strictRecall: true });
  assert.ok(bare.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(bare.errors));
  const recalled = checkChangeContract({ root, base: "base", git: gitFor("Change-contract: test:lessons:red->green\nRecall: test:lessons => scripts/lib/support/git-cli.mjs"), run: green, strictRecall: true });
  assert.ok(!recalled.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(recalled.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson with a testable gate must be exercised by the change", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test/gate.test.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const recalled = "Change-contract: test:lessons:red->green\nRecall: test/gate.test.mjs => scripts/lib/support/git-cli.mjs";
  const used = checkChangeContract({ root, base: "base", git: gitFor(recalled), run: green, strictRecall: true });
  assert.ok(used.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(used.errors));
  const exercised = checkChangeContract({ root, base: "base", git: gitFor(`${recalled}\nAt-risk: test/gate.test.mjs`), run: green, strictRecall: true });
  assert.ok(!exercised.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(exercised.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson's test declared as a non-green obligation does not count as exercised", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test/gate.test.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const body = "Change-contract: test:lessons:red->green, test/gate.test.mjs:green->red\nRecall: test/gate.test.mjs => scripts/lib/support/git-cli.mjs";
  const report = checkChangeContract({ root, base: "base", git: gitFor(body), run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson's test declared as a green obligation counts as exercised", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test/gate.test.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const body = "Change-contract: test:lessons:red->green, test/gate.test.mjs:red->green\nRecall: ./test/gate.test.mjs => scripts/lib/support/git-cli.mjs";
  const report = checkChangeContract({ root, base: "base", git: gitFor(body), run: green, strictRecall: true });
  assert.ok(!report.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson's source-module gate does not mask an unexercised test", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  mkdirSync(join(root, "scripts", "lib", "support"), { recursive: true });
  writeFileSync(join(root, "scripts", "lib", "support", "git-cli.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `scripts/lib/support/git-cli.mjs` | | `test/gate.test.mjs::probe@1234567` | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const body = "Change-contract: test:lessons:red->green, scripts/lib/support/git-cli.mjs:green->green\nRecall: scripts/lib/support/git-cli.mjs => scripts/lib/support/git-cli.mjs\nAt-risk: scripts/lib/support/git-cli.mjs";
  const report = checkChangeContract({ root, base: "base", git: gitFor(body), run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson whose gate is a command still requires its test at-risk", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `node --test test/gate.test.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const recalled = "Change-contract: test:lessons:red->green\nRecall: node --test test/gate.test.mjs => scripts/lib/support/git-cli.mjs";
  const used = checkChangeContract({ root, base: "base", git: gitFor(recalled), run: green, strictRecall: true });
  assert.ok(used.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(used.errors));
  const exercised = checkChangeContract({ root, base: "base", git: gitFor(`${recalled}\nAt-risk: test/gate.test.mjs`), run: green, strictRecall: true });
  assert.ok(!exercised.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(exercised.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a recalled lesson whose gate is a spaced test path requires it at-risk", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "has space.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test/has space.test.mjs` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: use\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x", "test:lib": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/support/git-cli.mjs" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const recalled = "Change-contract: test:lessons:red->green\nRecall: test/has space.test.mjs => scripts/lib/support/git-cli.mjs";
  const used = checkChangeContract({ root, base: "base", git: gitFor(recalled), run: green, strictRecall: true });
  assert.ok(used.errors.some((error) => error.rule === "unused-recall"), JSON.stringify(used.errors));
  const exercised = checkChangeContract({ root, base: "base", git: gitFor(`${recalled}\nAt-risk: test/has space.test.mjs`), run: green, strictRecall: true });
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
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
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
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("deleting an active lesson row is detected as shrinkage", () => {
  const root = makeRoot();
  const git = (_root, args) => {
    if (args[0] === "log") return { ok: true, out: "a1\u001fdocs\u001f" };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":docs/research/workflow-lessons.md")) return { ok: true, out: "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| Remove me | probe | `test:lessons` |\n" };
      if (args.includes("--name-only")) return { ok: true, out: "docs/research/workflow-lessons.md\0" };
      return { ok: true, out: "" };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "rev-list") return { ok: true, out: "0" };
    return { ok: false, out: "" };
  };
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "lesson-shrinkage"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a denied check cannot be referenced through an npm run prefix", () => {
  const root = makeRoot({ "test:lessons": "x", "test:lib": "x", "changes:check": "x" });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "chore", body: "Change-contract: npm run changes:check:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "changes:check": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green, strictRecall: true });
  assert.ok(report.errors.some((error) => error.rule === "unknown-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("the contract guard reads only the environment flag", () => {
  assert.equal(contractGuardActive({ KRN_CHANGE_CONTRACT: "0" }), true);
  assert.equal(contractGuardActive({}), false);
  assert.equal(contractGuardActive({ KRN_CHANGE_CONTRACT: "1" }), false);
});

test("a node --run chain that reaches a gutted test fails closed as non-literal", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-noderun-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:inner\":\"node --test test/t.test.mjs\",\"test:t\":\"node --run test:inner\"}}\n");
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "t.test.mjs"), 'import test from "node:test";\ntest("trivial", () => {});\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("gut\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a test filename containing = is still tracked for redefinition", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-eqname-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node test/a=b.test.mjs\"}}\n");
  writeFileSync(join(root, "test", "a=b.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "a=b.test.mjs"), 'import test from "node:test";\ntest("trivial", () => {});\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("gut\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a bare node --test script still detects a dropped case under --before", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-bareshrink-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test\"}}\n");
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("keep", () => assert.equal(typeof value, "number"));\ntest("flip", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("flip", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("fix\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(report.errors.some((error) => error.rule === "observer-shrinkage"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a script introduced in the range is self-authored even under --before", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-newscript-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{}}\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test test/t.test.mjs\"}}\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  commit("add check\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

function assertSelfAuthorized({ scripts, changedFile, shim = false }) {
  const root = mkdtempSync(join(tmpdir(), "krn-tok-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  const red = 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("x", () => assert.equal(value, 2));\n';
  mkdirSync(join(root, "test", "sub"), { recursive: true });
  for (const name of ["test/a.test.mjs", "test/a.test.ts", "test/foo.mjs", "test/b.test.mjs", "test/sub/a.test.mjs", "test/a\".test.mjs", "scripts/foo.test.mjs"]) writeFileSync(join(root, name), red);
  writeFileSync(join(root, "test", "register.mjs"), "export {};\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  if (shim) { mkdirSync(join(root, "node_modules", ".bin"), { recursive: true }); writeFileSync(join(root, "node_modules", ".bin", "gate"), "#!/bin/sh\nexit 0\n"); }
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, changedFile), 'import test from "node:test";\ntest("gutted", () => {});\n');
  commit("gut\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(report.errors.some((e) => e.rule === "self-authorized-check"), `${JSON.stringify(scripts)} => ${JSON.stringify(report.errors)}`);
  rmSync(root, { recursive: true, force: true });
}

test("assignment and flag tokens still track the named test", () => {
  assertSelfAuthorized({ scripts: { "test:t": "TESTFILE=test/a.test.mjs node --test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --import=./test/a.test.mjs -e \"\"" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --import ./test/register.mjs --test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test" }, changedFile: "scripts/foo.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test test/a.test.ts" }, changedFile: "test/a.test.ts" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test" }, changedFile: "test/foo.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test --test-name-pattern=test/a.test.mjs" }, changedFile: "test/b.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "X=test/a.test.mjs node --test" }, changedFile: "test/b.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node '--test'" }, changedFile: "test/b.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --te\\st" }, changedFile: "test/b.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test \"test\\sub\\a.test.mjs\"" }, changedFile: "test/sub/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test \"test/a\\\".test.mjs\"" }, changedFile: "test/a\".test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test --test-skip-pattern test/a.test.mjs" }, changedFile: "test/b.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test \"test\\\\sub\\\\a.test.mjs\"" }, changedFile: "test/sub/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --test test/ test/a.test.mjs" }, changedFile: "test/b.test.mjs" });
});

test("runner subcommands and node_modules shims fail closed as non-literal", () => {
  assertSelfAuthorized({ scripts: { "test:t": "bun test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "deno test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "npx mocha" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "gate" }, changedFile: "test/a.test.mjs", shim: true });
  assertSelfAuthorized({ scripts: { "test:t": "npm test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "npm --silent run test:inner" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "pnpm test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "pnpm dlx mocha" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "node --strict --run test:inner" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "pnpm --filter . test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "pnpm -C . test" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "npm --prefix . run test:inner" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "bun x mytest" }, changedFile: "test/a.test.mjs" });
});

test("--before freezes a non-ASCII changed helper under test/", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-frozen-unicode-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test test/gate.test.mjs\"}}\n");
  writeFileSync(join(root, "test", "hélper.mjs"), "export const flag = false;\n");
  writeFileSync(join(root, "test", "gate.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { flag } from "./hélper.mjs";\ntest("flag", () => assert.equal(flag, true));\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "hélper.mjs"), "export const flag = true;\n");
  writeFileSync(join(root, "test", "gate.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { flag } from "./hélper.mjs";\ntest("flag", () => assert.equal(flag, true));\ntest("extra", () => assert.equal(typeof flag, "boolean"));\n');
  commit("fix\n\nChange-contract: test/gate.test.mjs:red->green");
  const frozen = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(frozen.errors.some((error) => error.rule === "before-state-not-red"), JSON.stringify(frozen.errors));
  rmSync(root, { recursive: true, force: true });
});

test("--before freezes a changed test's helper closure, not just the test file", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-closure-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "test", "h.mjs"), "export const marker = 1;\n");
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("value is two", () => assert.equal(value, 2));\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "h.mjs"), "export const marker = 2;\nexport const fmt = (v) => `v${v}`;\n");
  writeFileSync(join(root, "test", "t.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\nimport { fmt } from "./h.mjs";\ntest("value is two", () => assert.equal(value, 2));\ntest("formatted", () => assert.equal(fmt(value), "v2"));\n');
  commit("fix\n\nChange-contract: test/t.test.mjs:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an explicit test-file argument keeps the declared check scoped", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-scoped-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test test/a.test.mjs\"}}\n");
  writeFileSync(join(root, "test", "a.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
  writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("changed", () => {});\n');
  commit("unrelated edit\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(!report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a directly named node check cannot be redefined", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-nodecheck-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node scripts/selfcheck.mjs\"}}\n");
  writeFileSync(join(root, "scripts", "selfcheck.mjs"), "process.exit(1);\n");
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "scripts", "selfcheck.mjs"), "process.exit(0);\n");
  commit("fix\n\nChange-contract: scripts/selfcheck.mjs:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a backslash-escaped space test path is still tracked", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-escspace-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: { "test:t": "node test/has\\ space.test.mjs" } })}\n`);
  writeFileSync(join(root, "test", "has space.test.mjs"), 'import test from "node:test";\ntest("real", () => {});\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "test", "has space.test.mjs"), 'import test from "node:test";\ntest("gutted", () => {});\n');
  commit("gut\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD" });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("boolean test flags and dot-segment paths are handled", () => {
  assertSelfAuthorized({ scripts: { "test:t": "node --test test/sub/../a.test.mjs" }, changedFile: "test/a.test.mjs" });
  assertSelfAuthorized({ scripts: { "test:t": "bash -lc 'node --test test/a.test.mjs'" }, changedFile: "test/a.test.mjs" });
});

test("a boolean or =value --test flag does not force enumeration", () => {
  for (const testScript of ["node --test --test-force-exit test/a.test.mjs", "node --test --test-reporter=spec test/a.test.mjs"]) {
    const root = mkdtempSync(join(tmpdir(), "krn-boolflag-"));
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
    mkdirSync(join(root, "test"), { recursive: true });
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: { "test:t": testScript } })}\n`);
    writeFileSync(join(root, "test", "a.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
    writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
    git("init", "-q"); commit("base");
    const base = git("rev-parse", "HEAD").trim();
    writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("changed", () => {});\n');
    commit("unrelated edit\n\nChange-contract: test:t:red->green");
    const report = checkChangeContract({ root, base, head: "HEAD" });
    assert.ok(!report.errors.some((error) => error.rule === "self-authorized-check"), `${testScript} => ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a bare node --test script does not report shrinkage for an untouched passing test", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-noshrink-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node --test\"}}\n");
  writeFileSync(join(root, "lib.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("flip", () => assert.equal(value, 2));\n');
  writeFileSync(join(root, "test", "other.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("stable", () => assert.equal(typeof value, "number"));\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "lib.mjs"), "export const value = 2;\n");
  writeFileSync(join(root, "test", "o.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../lib.mjs";\ntest("flip", () => assert.equal(value, 2));\ntest("extra", () => assert.equal(value * 1, 2));\n');
  commit("fix\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("skill scripts are part of the change-contract surface", () => {
  assert.equal(contractSurface(["skills/meta/unlazy/scripts/gate-check.mjs"]), true);
  assert.equal(contractSurface(["skills/advisory/opencode-second-opinion/scripts/run-opinion.sh"]), true);
  assert.equal(contractSurface(["skills/meta/unlazy/SKILL.md"]), true);
  assert.equal(contractSurface(["skills/engineering/target-repo-work/references/write-capable-targets.md"]), true);
});

test("a frozen run preserves setup flags", () => {
  assert.deepEqual(frozenNodeArgs("node --import ./test/preload.mjs --test test/a.test.mjs"), ["--import", "./test/preload.mjs"]);
  assert.deepEqual(frozenNodeArgs("node --require=./test/preload.cjs --test"), ["--require=./test/preload.cjs"]);
  assert.deepEqual(frozenNodeArgs("node --test test/a.test.mjs"), []);
  assert.deepEqual(frozenNodeArgs("node --import './test/pre load.mjs' --test test/a.test.mjs"), ["--import", "./test/pre load.mjs"]);
  assert.deepEqual(frozenNodeArgs("node --import ./test/has\\ space.mjs --test"), ["--import", "./test/has space.mjs"]);
});

test("a quoted multi-word value does not force enumeration", () => {
  for (const testScript of ['node --test --test-name-pattern "flip case" test/a.test.mjs', 'node --test "test/a b.test.mjs"']) {
    const root = mkdtempSync(join(tmpdir(), "krn-quoted-"));
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
    mkdirSync(join(root, "test"), { recursive: true });
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: { "test:t": testScript } })}\n`);
    writeFileSync(join(root, "test", "a.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
    writeFileSync(join(root, "test", "a b.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
    writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("ok", () => {});\n');
    git("init", "-q"); commit("base");
    const base = git("rev-parse", "HEAD").trim();
    writeFileSync(join(root, "test", "b.test.mjs"), 'import test from "node:test";\ntest("changed", () => {});\n');
    commit("unrelated edit\n\nChange-contract: test:t:red->green");
    const report = checkChangeContract({ root, base, head: "HEAD" });
    assert.ok(!report.errors.some((error) => error.rule === "self-authorized-check"), `${testScript} => ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a head that differs from the checkout is rejected before running", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-head-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  git("init", "-q"); commit("one");
  const first = git("rev-parse", "HEAD").trim();
  git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "--allow-empty", "-m", "two");
  const report = checkChangeContract({ root, base: first, head: first });
  assert.ok(report.errors.some((error) => error.rule === "head-mismatch"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a same-ref base and head is a vacuous range", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-vacuous-"));
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: {} })}\n`);
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
  run(["init", "-q"]);
  execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", "seed"]);
  const report = checkChangeContract({ root, base: "HEAD", head: "HEAD" });
  assert.ok(report.errors.some((error) => error.rule === "vacuous-range"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a behavior-preserving surface change may declare green->green", () => {
  const root = makeRoot();
  const run = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message]);
    return run(["rev-parse", "HEAD"]);
  };
  run(["init", "-q"]);
  commit("base");
  const base = run(["rev-parse", "HEAD"]);
  writeFileSync(join(root, "README.md"), "behavior-preserving docs\n");
  commit("docs\n\nChange-contract: test:lessons:green->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true, run: () => ({ ok: true, status: 0, spawnFailed: false, output: "" }) });
  assert.ok(!report.errors.some((error) => error.rule === "non-falsifiable-prediction"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "before-state-not-red"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a script that merely takes --test is run via npm, not substituted", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-testflag-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = (message) => { git("-c", "user.email=l@x", "-c", "user.name=l", "add", "-A"); git("-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", message); };
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n");
  writeFileSync(join(root, "package.json"), "{\"scripts\":{\"test:t\":\"node scripts/check.mjs --test\"}}\n");
  writeFileSync(join(root, "scripts", "check.mjs"), "process.exit(1);\n");
  writeFileSync(join(root, "scripts", "lib", "x.mjs"), "export const x = 1;\n");
  writeFileSync(join(root, "test", "a.test.mjs"), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { x } from "../scripts/lib/x.mjs";\ntest("x is two", () => assert.equal(x, 2));\n');
  git("init", "-q"); commit("base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "scripts", "lib", "x.mjs"), "export const x = 2;\n");
  commit("fix\n\nChange-contract: test:t:red->green");
  const report = checkChangeContract({ root, base, head: "HEAD", verifyBefore: true });
  assert.ok(report.errors.some((error) => error.rule === "unmet-prediction"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});
