import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GIT_LOG_FORMAT, commitChangedFiles, gitAvailable, gitText, parseGitLogRecords, runGit } from "../../scripts/lib/kernel/git.mjs";

test("gitAvailable detects a usable git", () => {
  assert.equal(gitAvailable(), true);
});

test("runGit returns trimmed output inside a repo and fails safely outside", () => {
  const inside = runGit(process.cwd(), ["rev-parse", "--is-inside-work-tree"]);
  assert.equal(inside.ok, true);
  assert.equal(inside.out, "true");
  const outside = runGit("/nonexistent-krn-repo-xyz", ["status"]);
  assert.equal(outside.ok, false);
  assert.equal(outside.out, "");
});

test("runGit keeps the failure cause: exit status versus spawn error", () => {
  const badRevision = runGit(process.cwd(), ["rev-parse", "no-such-revision-krn"]);
  assert.equal(badRevision.ok, false);
  assert.equal(typeof badRevision.status, "number");
  assert.equal(badRevision.errorCode, null);
  const savedPath = process.env.PATH;
  process.env.PATH = "/nonexistent-krn-path";
  try {
    const missingBinary = runGit(process.cwd(), ["--version"]);
    assert.equal(missingBinary.ok, false);
    assert.equal(missingBinary.status, null);
    assert.equal(missingBinary.errorCode, "ENOENT");
  } finally {
    process.env.PATH = savedPath;
  }
});

test("gitText returns empty on failure and the value on success", () => {
  assert.equal(gitText(process.cwd(), ["rev-parse", "--is-inside-work-tree"]), "true");
  assert.equal(gitText("/nonexistent-krn-repo-xyz", ["status"]), "");
});

test("runGit keeps large output instead of silently truncating", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-gitbuf-"));
  try {
    execFileSync("git", ["-C", root, "init", "-q"]);
    writeFileSync(join(root, "big.txt"), "a".repeat(1200 * 1024));
    execFileSync("git", ["-C", root, "add", "big.txt"]);
    execFileSync("git", ["-C", root, "-c", "user.email=l@x", "-c", "user.name=l", "commit", "-q", "-m", "base"]);
    writeFileSync(join(root, "big.txt"), "b".repeat(1200 * 1024));
    const result = runGit(root, ["diff"]);
    assert.equal(result.ok, true);
    assert.ok(result.out.length > 1024 * 1024, `diff output was ${result.out.length} bytes`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseGitLogRecords splits the NUL-safe log format", () => {
  assert.equal(GIT_LOG_FORMAT.includes("%H%x1f%s%x1f%b%x1e"), true);
  assert.deepEqual(parseGitLogRecords("abc\u001fsubject\u001fbody\u001e"), [{ sha: "abc", subject: "subject", body: "body" }]);
  assert.deepEqual(parseGitLogRecords(""), []);
});

test("commitChangedFiles preserves whitespace in path names", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-git-ws-"));
  const g = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  g(["init", "-q"]);
  g(["config", "user.email", "l@x"]);
  g(["config", "user.name", "l"]);
  writeFileSync(join(root, " lead.mjs"), "x\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "feat: x"]);
  const sha = g(["rev-parse", "HEAD"]).trim();
  const files = commitChangedFiles(root, runGit, sha).files;
  assert.ok(files.includes(" lead.mjs"), JSON.stringify(files));
  rmSync(root, { recursive: true, force: true });
});
