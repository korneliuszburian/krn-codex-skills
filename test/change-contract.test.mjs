import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract, contractGuardActive, contractSurface, parseChangeContract } from "../scripts/lib/change-contract.mjs";

function makeRoot(scripts = { "test:lessons": "x", "test:lib": "x" }) {
  const root = mkdtempSync(join(tmpdir(), "krn-contract-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
  return root;
}

function fakeGit({ commits, files, baseScripts = {}, baseFiles = [], blobs = {}, trees = {} }) {
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
      const spec = args[args.length - 1];
      const rel = spec.split(":").slice(1).join(":");
      return { ok: baseFiles.includes(rel) || Object.hasOwn(blobs, spec), out: "" };
    }
    if (args[0] === "rev-parse") {
      const key = args[args.length - 1];
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
  assert.equal(contractSurface(["scripts/lib/lessons.mjs"]), true);
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.results.length, 2);
  rmSync(root, { recursive: true, force: true });
});

test("a malformed part fails the whole contract line closed", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:lib:red->green, changes:check" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:lib": "x" },
  });
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), JSON.stringify(report.errors));
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
    const report = checkChangeContract({ root, base: "base", git, run: green });
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
    const report = checkChangeContract({ root, base: "base", git, run: green });
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
    const report = checkChangeContract({ root, base: "base", git, run: green });
    assert.ok(report.errors.some((error) => error.rule === "self-authorized-check" && error.detail.includes("redefined")), `${script}: ${JSON.stringify(report.errors)}`);
    rmSync(root, { recursive: true, force: true });
  }
  const root = makeRoot({ "test:g": `node --test "test/[ab].test.mjs"` });
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix", body: "Change-contract: test:g:red->green" }],
    files: { a1: ["scripts/lib/x.mjs"] },
    baseScripts: { "test:g": `node --test "test/[ab].test.mjs"` },
  });
  assert.ok(checkChangeContract({ root, base: "base", git, run: green }).errors.some((error) => error.detail.includes("not a literal")), "metachar tokens fail closed");
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
    const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "unreadable-changed-files"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
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

test("a recalled lesson whose gate is a command still requires its test at-risk", () => {
  const root = makeRoot();
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `node --test test/gate.test.mjs` | | | path:scripts/lib/git-cli.mjs |\n",
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
  const recalled = "Change-contract: test:lessons:red->green\nRecall: node --test test/gate.test.mjs => scripts/lib/git-cli.mjs";
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
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
  const report = checkChangeContract({ root, base: "base", git, run: green });
  assert.ok(report.errors.some((error) => error.rule === "unknown-check"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("the contract guard reads only the environment flag", () => {
  assert.equal(contractGuardActive({ KRN_CHANGE_CONTRACT: "0" }), true);
  assert.equal(contractGuardActive({}), false);
  assert.equal(contractGuardActive({ KRN_CHANGE_CONTRACT: "1" }), false);
});
