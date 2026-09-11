import assert from "node:assert/strict";
import test from "node:test";

import { gitAvailable, gitText, runGit } from "../scripts/lib/git-cli.mjs";

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
