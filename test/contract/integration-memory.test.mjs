import assert from "node:assert/strict";
import { git } from "../support/git-fixture.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));

const commit = (root, message) => {
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
};
const run = (args) => {
  const env = { ...process.env };
  delete env.KRN_CHANGE_CONTRACT;
  const result = spawnSync(process.execPath, [cli, ...args, "--json"], { encoding: "utf8", env });
  try {
    return JSON.parse(result.stdout);
  } catch {
    assert.fail(`the CLI did not return JSON (status ${result.status}): ${result.stderr || result.stdout}`);
  }
};

test("the memory harness composes: a triggered lesson blocks an unreconstructed change", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-int-memory-"));
  try {
    git(root, ["init", "-q"]);
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "scripts", "x.mjs"), "export const x = 1;\n");
    writeFileSync(join(root, "test", "gate.mjs"), 'import test from "node:test";\ntest("gate", () => {});\n');
    writeFileSync(
      join(root, "docs", "research", "workflow-lessons.md"),
      "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Adapters | probe | `test/gate.mjs` | | | path:scripts/x.mjs |\n",
    );
    const base = commit(root, "chore: init");

    writeFileSync(join(root, "scripts", "x.mjs"), "export const x = 2;\n");
    const unreconstructed = commit(root, "feat: touch x\n\nChange-contract: test/gate.mjs:red->green");
    const advisory = run(["changes", "check", "--root", root, "--base", base, "--head", unreconstructed]);
    assert.ok(advisory.warnings.some((warning) => warning.rule === "unreconstructed-recall"), JSON.stringify(advisory.warnings));
    assert.ok(!advisory.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(advisory.errors));
    const blocked = run(["changes", "check", "--root", root, "--base", base, "--head", unreconstructed, "--strict-recall"]);
    assert.ok(blocked.errors.some((error) => error.rule === "unreconstructed-recall"), JSON.stringify(blocked.errors));

    writeFileSync(join(root, "scripts", "x.mjs"), "export const x = 3;\n");
    const reconstructed = commit(root, "fix: touch x\n\nChange-contract: test/gate.mjs:red->green\nRecall: test/gate.mjs => scripts/x.mjs");
    const allowed = run(["changes", "check", "--root", root, "--base", unreconstructed, "--head", reconstructed, "--strict-recall"]);
    assert.deepEqual(allowed.errors, [], JSON.stringify(allowed.errors));

    const lessons = run(["lessons", "check", "--root", root]);
    assert.deepEqual(lessons.errors, [], JSON.stringify(lessons.errors));
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("memory recall normalizes a ./-prefixed changed path", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-int-normalize-"));
  try {
    git(root, ["init", "-q"]);
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:state": "x" } }));
    writeFileSync(join(root, "scripts", "foo.mjs"), "export const x = 1;\n");
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| A | probe | `test:state` | | | path:scripts/foo.mjs | |\n");
    commit(root, "seed");
    const bare = run(["memory", "recall", "--root", root, "--changed", "scripts/foo.mjs"]);
    const dotted = run(["memory", "recall", "--root", root, "--changed", "./scripts/foo.mjs"]);
    const absolute = run(["memory", "recall", "--root", root, "--changed", join(root, "scripts", "foo.mjs")]);
    assert.equal(bare.hits.length, 1, JSON.stringify(bare));
    assert.equal(dotted.hits.length, 1, JSON.stringify(dotted));
    assert.equal(absolute.hits.length, 1, JSON.stringify(absolute));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
