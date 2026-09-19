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
    .filter((relative) => /\.(mjs|js)$/.test(relative))
    .filter((relative) => relative.startsWith("scripts/"))
    .sort();
}

test("TAP parsing has exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function tapName"));
  assert.deepEqual(owners, ["scripts/lib/kernel/tap.mjs"], "TAP name parsing must live only in the kernel");
  const summaries = trackedSources().filter((relative) => read(relative).includes("export function tapSummary"));
  assert.deepEqual(summaries, ["scripts/lib/kernel/tap.mjs"], "TAP summary parsing must live only in the kernel");
});

test("the duplicated support tap module is gone and unreferenced", () => {
  assert.ok(!exists("scripts/lib/support/tap.mjs"), "support/tap.mjs must be deleted");
  const stale = trackedSources().filter((relative) => read(relative).includes("support/tap.mjs"));
  assert.deepEqual(stale, [], "no source may import the retired support/tap.mjs");
});
