import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js)$/.test(relative))
    .filter((relative) => relative.startsWith("scripts/"))
    .sort();
}

test("temporary git worktrees have exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function withWorktree"));
  assert.deepEqual(owners, ["scripts/lib/kernel/worktree.mjs"], "worktree lifecycle must live only in the kernel");
});

test("no consumer hand-rolls a temporary worktree", () => {
  const offenders = trackedSources().filter((relative) => read(relative).includes('"worktree", "add"'));
  assert.deepEqual(offenders, ["scripts/lib/kernel/worktree.mjs"], "only the kernel owner may add a worktree");
});
