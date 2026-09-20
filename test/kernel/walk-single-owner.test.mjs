import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

// The owner is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when the owner does not exist yet.
const loadWalk = async () => {
  try {
    return await import("../../scripts/lib/kernel/walk.mjs");
  } catch {
    return null;
  }
};

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js)$/.test(relative))
    .filter((relative) => relative.startsWith("scripts/"))
    .sort();
}

const CONSUMERS = [
  "scripts/lib/audit/quality-audit.mjs",
  "scripts/validate.mjs",
  "scripts/lib/contract/change-contract-runs.mjs",
  "scripts/lib/ticket/ticket.mjs",
  "scripts/lib/install/skills-export.mjs",
];

test("recursive file listing has exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function walkFiles"));
  assert.deepEqual(owners, ["scripts/lib/kernel/walk.mjs"], "the recursive walker must live only in the kernel");
  for (const consumer of CONSUMERS) {
    assert.ok(
      read(consumer).includes('from "../kernel/walk.mjs"') || read(consumer).includes('from "./lib/kernel/walk.mjs"'),
      `${consumer} must import the kernel walk owner`,
    );
  }
  assert.ok(!read("scripts/lib/install/install-inspect.mjs").includes("kernel/walk.mjs"), "the release-digest traversal keeps its own ABI key spelling");
});

test("the kernel walker is depth-first with an optional comparator", async () => {
  const walk = await loadWalk();
  assert.ok(walk, "scripts/lib/kernel/walk.mjs must exist");
  const dir = mkdtempSync(path.join(tmpdir(), "krn-walk-"));
  try {
    writeFileSync(path.join(dir, "b.txt"), "b");
    writeFileSync(path.join(dir, "a.txt"), "a");
    mkdirSync(path.join(dir, "sub", "deeper"), { recursive: true });
    writeFileSync(path.join(dir, "sub", "c.txt"), "c");
    writeFileSync(path.join(dir, "sub", "deeper", "d.txt"), "d");
    const sorted = walk.walkFiles(dir, { compare: (left, right) => left.name.localeCompare(right.name) });
    assert.deepEqual(sorted.map((entry) => entry.relative), ["a.txt", "b.txt", "sub/c.txt", "sub/deeper/d.txt"]);
    assert.equal(sorted[0].path, path.join(dir, "a.txt"));
    const filtered = walk.walkFiles(dir, { filter: (entry) => entry.dirent.name === "c.txt" });
    assert.deepEqual(filtered.map((entry) => entry.relative), ["sub/c.txt"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable root yields an empty list unless the caller asks for the error", async () => {
  const walk = await loadWalk();
  assert.ok(walk, "scripts/lib/kernel/walk.mjs must exist");
  const missing = path.join(tmpdir(), "krn-walk-absent", String(Date.now()));
  assert.deepEqual(walk.walkFiles(missing), []);
  assert.throws(() => walk.walkFiles(missing, { onError: "throw" }));
});

test("the digest caller pins its hash order through the owner", () => {
  const exporter = read("scripts/lib/install/skills-export.mjs");
  assert.ok(exporter.includes("walkFiles(directory, { compare:"), "the export digest must pin the walk order");
  assert.ok(!exporter.includes("readdirSync(dir, { withFileTypes: true }).sort"), "the export must not hand-roll the sorted walk");
});
