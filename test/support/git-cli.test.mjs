import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { gitAvailable, gitText, runGit } from "../../scripts/lib/support/git-cli.mjs";

test("gitAvailable detects a usable git", () => {
  assert.equal(gitAvailable(), true);
});

test("runGit returns trimmed output inside a repo and fails safely outside", () => {
  const inside = runGit(process.cwd(), ["rev-parse", "--is-inside-work-tree"]);
  assert.equal(inside.ok, true);
  assert.equal(inside.out, "true");
  assert.deepEqual(runGit("/nonexistent-krn-repo-xyz", ["status"]), { ok: false, out: "" });
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
