import assert from "node:assert/strict";
import test from "node:test";

import { changedLineNumbers, extractSymbols, removedLineNumbers, touchedSymbols } from "../scripts/lib/symbol-triggers.mjs";

const source = [
  "import x from 'y';",
  "export function runGit(repo, args) {",
  "  return 1;",
  "}",
  "",
  "export const VALUE = 3;",
  "export class Thing {",
  "}",
].join("\n");

test("extractSymbols finds exported declarations with spans", () => {
  const symbols = extractSymbols(source);
  assert.deepEqual(symbols.map((symbol) => symbol.name), ["runGit", "VALUE", "Thing"]);
  assert.deepEqual(symbols[0], { name: "runGit", kind: "function", start: 2, end: 4 });
  assert.deepEqual(symbols[1], { name: "VALUE", kind: "const", start: 6, end: 6 });
});

test("extractSymbols ignores braces inside strings and comments", () => {
  const tricky = [
    "export function a() {",
    '  const s = "{ not a brace }";',
    "  // } not this either",
    "  return s;",
    "}",
    "export function b() {",
    "  return 1;",
    "}",
  ].join("\n");
  const symbols = extractSymbols(tricky);
  assert.deepEqual(symbols.map((symbol) => ({ name: symbol.name, start: symbol.start, end: symbol.end })), [
    { name: "a", start: 1, end: 5 },
    { name: "b", start: 6, end: 8 },
  ]);
});

test("changed line parsers handle added and removed hunks", () => {
  assert.deepEqual([...changedLineNumbers("@@ -1,2 +1,3 @@\n@@ -10 +11 @@\n")].sort((a, b) => a - b), [1, 2, 3, 11]);
  assert.deepEqual([...removedLineNumbers("@@ -3 +2,0 @@\n")], [3]);
});

test("touchedSymbols maps changed lines to the symbol they fall inside", () => {
  const git = (_root, args) => {
    if (args[0] === "diff") return { ok: true, out: "--- a/scripts/lib/git-cli.mjs\n+++ b/scripts/lib/git-cli.mjs\n@@ -2,0 +3,1 @@\n" };
    if (args[0] === "show") return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\nexport const OTHER = 1;\n" };
    return { ok: false, out: "" };
  };
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["runGit"]);
});

test("touchedSymbols reports a deleted symbol from the pre-image", () => {
  const git = (_root, args) => {
    if (args[0] === "diff") return { ok: true, out: "--- a/scripts/lib/git-cli.mjs\n+++ /dev/null\n@@ -1,3 +0,0 @@\n" };
    if (args[0] === "show") return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\n" };
    return { ok: false, out: "" };
  };
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["runGit"]);
});

test("touchedSymbols handles a path with spaces", () => {
  const git = (_root, args) => {
    if (args[0] === "diff") return { ok: true, out: "--- a/sub/a file.mjs\n+++ b/sub/a file.mjs\n@@ -0,0 +1,2 @@\n" };
    if (args[0] === "show") return { ok: true, out: "export function spaced() {\n  return 1;\n}\n" };
    return { ok: false, out: "" };
  };
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["spaced"]);
});
