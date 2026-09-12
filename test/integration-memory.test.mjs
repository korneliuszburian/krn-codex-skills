import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/krn-codex.mjs", import.meta.url));

const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
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
    const advisory = run(["changes", "check", "--root", root, "--base", base, "--head", unreconstructed, "--advisory-recall"]);
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
