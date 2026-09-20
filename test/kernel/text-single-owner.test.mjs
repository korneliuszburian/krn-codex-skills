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

test("glob and regexp escaping have exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function escapeRegExp"));
  assert.deepEqual(owners, ["scripts/lib/kernel/text.mjs"], "regexp escaping must live only in the kernel");
  const globOwners = trackedSources().filter((relative) => read(relative).includes("function compileGlob"));
  assert.deepEqual(globOwners, ["scripts/lib/kernel/text.mjs"], "glob compilation must live only in the kernel");
});

test("the duplicated support regexp module is gone and unreferenced", () => {
  assert.ok(!exists("scripts/lib/support/regexp.mjs"), "support/regexp.mjs must be deleted");
  const stale = trackedSources().filter((relative) => read(relative).includes("support/regexp.mjs"));
  assert.deepEqual(stale, [], "no source may import the retired support/regexp.mjs");
});

test("markdown table row parsing has exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function splitTableRow"));
  assert.deepEqual(owners, ["scripts/lib/kernel/text.mjs"], "table row parsing must live only in the kernel");
});
