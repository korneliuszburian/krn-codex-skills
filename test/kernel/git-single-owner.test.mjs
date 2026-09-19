import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js|py|sh)$/.test(relative))
    .filter((relative) => !relative.startsWith("test/"))
    .sort();
}

test("git invocation has exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("rev-parse"));
  assert.deepEqual(
    owners,
    ["scripts/lib/kernel/git.mjs", "scripts/lib/kernel/repo-root.mjs"],
    "repository-root resolution must live only in the kernel",
  );
});

test("the duplicated support git modules are gone and unreferenced", () => {
  assert.ok(!exists("scripts/lib/support/git-cli.mjs"), "support/git-cli.mjs must be deleted");
  assert.ok(!exists("scripts/lib/support/repo-root.mjs"), "support/repo-root.mjs must be deleted");
  const stale = trackedSources().filter((relative) => read(relative).includes("support/git-cli.mjs"));
  assert.deepEqual(stale, [], "no source may import the retired support/git-cli.mjs");
});
