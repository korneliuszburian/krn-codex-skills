import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

// The owner is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when the owner does not exist yet.
const loadJs = async () => {
  try {
    return await import("../../scripts/lib/kernel/js.mjs");
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

test("JavaScript lexical parsing has exactly one kernel owner", () => {
  const sources = trackedSources();
  for (const symbol of ["export function maskLiterals", "export function touchedSymbolFiles"]) {
    const owners = sources.filter((relative) => read(relative).includes(symbol));
    assert.deepEqual(owners, ["scripts/lib/kernel/js.mjs"], `${symbol} must live only in the kernel`);
  }
});

test("the retired support modules are gone and unreferenced", () => {
  for (const relative of ["scripts/lib/support/source-mask.mjs", "scripts/lib/support/symbol-triggers.mjs"]) {
    assert.ok(!exists(relative), `${relative} must be deleted`);
  }
  const stale = trackedSources().filter((relative) => /support\/(source-mask|symbol-triggers)\.mjs/.test(read(relative)));
  assert.deepEqual(stale, [], "no source may reference the retired support modules");
});

test("the kernel owner keeps the masking and symbol behavior", async () => {
  const js = await loadJs();
  assert.ok(js, "scripts/lib/kernel/js.mjs must exist");
  assert.equal(js.stripComments("const a = 1; // c"), "const a = 1;     ");
  assert.equal(js.maskLiterals('const a = "abc";'), 'const a = "   ";');
  assert.deepEqual(js.extractSymbols("export function foo() {}\nexport const bar = 1;"), [
    { name: "foo", kind: "function", start: 1, end: 1 },
    { name: "bar", kind: "const", start: 2, end: 2 },
  ]);
});

test("the consumers import the kernel owner", () => {
  for (const consumer of [
    "scripts/lib/audit/quality-audit.mjs",
    "scripts/lib/contract/change-contract.mjs",
    "scripts/lib/contract/runtime-closure.mjs",
    "scripts/lib/lessons/lessons-recall.mjs",
  ]) {
    assert.ok(read(consumer).includes('from "../kernel/js.mjs"'), `${consumer} must import the kernel js owner`);
  }
});
