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

test("json reading has exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function readJson"));
  assert.deepEqual(owners, ["scripts/lib/kernel/json.mjs"], "JSON reading must live only in the kernel");
});

test("the duplicated support json module is gone and unreferenced", () => {
  assert.ok(!exists("scripts/lib/kernel/json.mjs"), "kernel/json.mjs must be deleted");
  const stale = trackedSources().filter((relative) => read(relative).includes("kernel/json.mjs"));
  assert.deepEqual(stale, [], "no source may import the retired kernel/json.mjs");
});
