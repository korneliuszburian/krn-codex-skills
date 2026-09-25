import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkChangeContract } from "../../scripts/lib/contract/change-contract.mjs";

const HEADER = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
const CLI = join(fileURLToPath(new URL("../..", import.meta.url)), "scripts", "krn.mjs");
const CLI_TRIGGER_ROW = "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |";

function makeRoot(scripts = { "test:lessons": "x" }) {
  const root = mkdtempSync(join(tmpdir(), "krn-recall-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), HEADER);
  return root;
}

function writeLessons(root, row) {
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${HEADER}${row}\n`);
}

function fakeGit({ commits, files, baseScripts = {}, baseFiles = [], blobs = {} }) {
  return (_root, args) => {
    if (args[0] === "merge-base") return { ok: true, out: "" };
    if (args[0] === "log") return { ok: true, out: commits.map((commit) => `${commit.sha}\u001f${commit.subject}\u001f${commit.body ?? ""}`).join("\u001e") };
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
      const names = args[args.length - 1] === "base" ? baseFiles : [];
      return { ok: true, out: args.includes("-z") ? names.join("\0") : names.join("\n") };
    }
    return { ok: false, out: "" };
  };
}

const green = () => ({ ok: true, status: 0 });

function changedGit(body, changed = ["scripts/lib/x.mjs"]) {
  return fakeGit({
    commits: [{ sha: "a1", subject: "fix: change", body }],
    files: { a1: changed },
    baseScripts: { "test:lessons": "x" },
  });
}

function report(root, body, { git, strictRecall } = {}) {
  const options = { root, base: "base", git: git ?? changedGit(body), run: green };
  if (strictRecall !== undefined) options.strictRecall = strictRecall;
  return checkChangeContract(options);
}

const recallErrors = (result) => result.errors.filter((entry) => entry.rule === "unreconstructed-recall");
const recallWarnings = (result) => result.warnings.filter((entry) => entry.rule === "unreconstructed-recall");
const waiverErrors = (result) => result.errors.filter((entry) => entry.rule === "recall-waiver-unresolved");

test("a path trigger that matches the diff blocks by default", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const result = report(root, "Change-contract: test:lessons:red->green");
  assert.ok(recallErrors(result).length > 0, `an unreconstructed path hit must block: ${JSON.stringify(result)}`);
  assert.equal(recallWarnings(result).length, 0, JSON.stringify(result.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("a reconstructing Recall trailer satisfies a default path obligation", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const result = report(root, "Change-contract: test:lessons:red->green\nRecall: test:lessons => scripts/lib/x.mjs");
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
  rmSync(root, { recursive: true, force: true });
});

test("Recall: none naming a lesson anchor waives a matching trigger by default", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const body = "Change-contract: test:lessons:red->green\nRecall: none (test:lessons)";
  const result = report(root, body);
  assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  assert.equal(recallWarnings(result).length, 0, JSON.stringify(result.warnings));
  assert.equal(waiverErrors(result).length, 0, JSON.stringify(result.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a flippant waiver naming nothing resolvable is refused", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const body = "Change-contract: test:lessons:red->green\nRecall: none (generated fixture; the lesson does not apply yet)";
  const result = report(root, body);
  assert.ok(waiverErrors(result).length > 0, `an unresolvable waiver must be named: ${JSON.stringify(result.errors)}`);
  rmSync(root, { recursive: true, force: true });
});

test("a waiver naming an existing path resolves and scopes to its trigger", () => {
  const root = makeRoot();
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  writeFileSync(join(root, "scripts", "lib", "x.mjs"), "// x\n");
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const body = "Change-contract: test:lessons:red->green\nRecall: none (scripts/lib/x.mjs)";
  const result = report(root, body);
  assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  assert.equal(waiverErrors(result).length, 0, JSON.stringify(result.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a waiver for one lesson does not waive an unrelated trigger", () => {
  const root = makeRoot();
  writeLessons(
    root,
    "| Alpha | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |\n| Beta | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |",
  );
  const body = "Change-contract: test:lessons:red->green\nRecall: none (Alpha)";
  const result = report(root, body);
  assert.equal(waiverErrors(result).length, 0, JSON.stringify(result.errors));
  const blocked = recallErrors(result).map((entry) => entry.ref);
  assert.deepEqual(blocked, ["Beta"], `only the unnamed lesson stays obligated: ${JSON.stringify(result.errors)}`);
  rmSync(root, { recursive: true, force: true });
});

test("a waiver naming a queued ticket resolves", () => {
  const root = makeRoot();
  mkdirSync(join(root, ".krn/tickets"), { recursive: true });
  writeFileSync(join(root, ".krn/tickets", "sh-99.md"), "<krn-ticket>\nId: sh-99\nScope: scripts/lib/x.mjs\n</krn-ticket>\n");
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const body = "Change-contract: test:lessons:red->green\nRecall: none (sh-99)";
  const result = report(root, body);
  assert.equal(waiverErrors(result).length, 0, JSON.stringify(result.errors));
  assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  rmSync(root, { recursive: true, force: true });
});

test("Recall: none without a reason does not waive the obligation", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const result = report(root, "Change-contract: test:lessons:red->green\nRecall: none");
  assert.ok(recallErrors(result).length > 0, JSON.stringify(result.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a change that matches no trigger carries no recall obligation", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/other.mjs | |");
  const result = report(root, "Change-contract: test:lessons:red->green");
  assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  assert.equal(recallWarnings(result).length, 0, JSON.stringify(result.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("an explicit strictRecall false keeps recall advisory", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |");
  const result = report(root, "Change-contract: test:lessons:red->green", { strictRecall: false });
  assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  assert.ok(recallWarnings(result).length > 0, JSON.stringify(result.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("a symbol trigger that matches the diff blocks by default", () => {
  const root = makeRoot();
  writeLessons(root, "| Guards | probe | `test:lessons` | | | symbol:runGit | |");
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") return { ok: true, out: `a1\u001ffic: sym\u001f${body}` };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\n" };
      return { ok: true, out: "scripts/lib/kernel/git.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "+++ b/scripts/lib/kernel/git.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const body = "Change-contract: test:lessons:red->green";
  const bare = report(root, body, { git: gitFor(body) });
  assert.ok(recallErrors(bare).length > 0, JSON.stringify(bare.errors));
  const recalled = report(root, `${body}\nRecall: test:lessons => runGit`, { git: gitFor(`${body}\nRecall: test:lessons => runGit`) });
  assert.equal(recallErrors(recalled).length, 0, JSON.stringify(recalled.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a churn-only trigger stays advisory unless strictRecall is set", () => {
  const root = makeRoot();
  writeLessons(root, "| Fragile | probe | `test:lessons` | | | churn:scripts/lib/x.mjs | |");
  const gitFor = (body) => (_root, args) => {
    if (args[0] === "log") {
      if (args.includes("--name-only")) return { ok: true, out: "scripts/lib/x.mjs\0scripts/lib/x.mjs\0" };
      return { ok: true, out: `a1\u001ffic: churn\u001f${body}` };
    }
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: { "test:lessons": "x" } }) };
      if (last.includes(":")) return { ok: true, out: "export const x = 1;\n" };
      return { ok: true, out: "scripts/lib/x.mjs" };
    }
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: "--- a/scripts/lib/x.mjs\n+++ b/scripts/lib/x.mjs\n@@ -0,0 +2,1 @@\n" };
    if (args[0] === "rev-list") return { ok: true, out: "2" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const body = "Change-contract: test:lessons:red->green";
  const advisory = report(root, body, { git: gitFor(body) });
  assert.equal(recallErrors(advisory).length, 0, JSON.stringify(advisory.errors));
  assert.ok(recallWarnings(advisory).length > 0, JSON.stringify(advisory.warnings));
  const strict = report(root, body, { git: gitFor(body), strictRecall: true });
  assert.ok(recallErrors(strict).length > 0, JSON.stringify(strict.errors));
  rmSync(root, { recursive: true, force: true });
});

function gitIn(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function makeCliRepo({ trailer = "Change-contract: test:lessons:green->green" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "krn-recall-cli-"));
  gitIn(dir, ["init", "-q"]);
  gitIn(dir, ["config", "user.name", "krn-test"]);
  gitIn(dir, ["config", "user.email", "krn-test@example.invalid"]);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ scripts: { "test:lessons": "node --test test/lessons.test.mjs" } }, null, 2)}\n`);
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "test", "lessons.test.mjs"), "import test from \"node:test\";\ntest(\"green\", () => {});\n");
  mkdirSync(join(dir, "docs", "research"), { recursive: true });
  writeFileSync(join(dir, "docs", "research", "workflow-lessons.md"), `${HEADER}${CLI_TRIGGER_ROW}\n`);
  mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
  writeFileSync(join(dir, "scripts", "lib", "x.mjs"), "export const x = 1;\n");
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-qm", "chore: baseline"]);
  writeFileSync(join(dir, "scripts", "lib", "x.mjs"), "export const x = 2;\n");
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-qm", `fix: bump x\n\n${trailer}`]);
  return dir;
}

function runCli(dir, extra = []) {
  // changes:check runs every declared check with KRN_CHANGE_CONTRACT=0 so the
  // nested CLI must not inherit a disabled guard; pin the enabled value.
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "1" };
  return spawnSync(process.execPath, [CLI, "changes", "check", "--root", dir, "--base", "HEAD~1", "--head", "HEAD", ...extra], { cwd: dir, encoding: "utf8", env });
}

test("the CLI keeps recall advisory by default", () => {
  const dir = makeCliRepo();
  try {
    const result = runCli(dir);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /warning: unreconstructed-recall/, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI --recall-obligation blocks a path hit that is not reconstructed", () => {
  const dir = makeCliRepo();
  try {
    const result = runCli(dir, ["--recall-obligation"]);
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /error: unreconstructed-recall/, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI --recall-obligation accepts a reconstructing Recall trailer", () => {
  const dir = makeCliRepo({ trailer: "Change-contract: test:lessons:green->green\nRecall: test:lessons => scripts/lib/x.mjs" });
  try {
    const result = runCli(dir, ["--recall-obligation"]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI refuses --strict-recall together with --recall-obligation", () => {
  const dir = makeCliRepo();
  try {
    const result = runCli(dir, ["--strict-recall", "--recall-obligation"]);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /mutually exclusive/, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// An inherited guard skips the contract, so an explicit recall mode is inert;
// name that instead of letting the flag look effective.
test("the CLI names an explicit recall mode as inert under an inherited guard", () => {
  const dir = makeCliRepo();
  try {
    const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
    const result = spawnSync(process.execPath, [CLI, "changes", "check", "--root", dir, "--base", "HEAD~1", "--head", "HEAD", "--recall-obligation"], { cwd: dir, encoding: "utf8", env });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /warning: recall-mode-inert/, `the inert mode must be named:\n${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
