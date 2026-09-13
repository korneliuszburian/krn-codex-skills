import assert from "node:assert/strict";
import test from "node:test";

import { changedLineNumbers, extractSymbols, removedLineNumbers, touchedSymbolFiles } from "../../scripts/lib/contract/symbol-triggers.mjs";

const touchedSymbols = (args) => [...touchedSymbolFiles(args).keys()];

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

test("extractSymbols scopes destructured parameters and reads export lists", () => {
  assert.deepEqual(extractSymbols("export function f({ x }) {\n  return x;\n}\n"), [{ name: "f", kind: "function", start: 1, end: 3 }]);
  assert.deepEqual(extractSymbols("function g() { return 1; }\nexport { g };\n").map((symbol) => symbol.name), ["g"]);
  assert.deepEqual(extractSymbols("export const f = ({ x }) => {\n  return x;\n};\n"), [{ name: "f", kind: "const", start: 1, end: 3 }]);
  assert.deepEqual(extractSymbols("export function* gen() {\n  yield 1;\n}\n"), [{ name: "gen", kind: "function*", start: 1, end: 3 }]);
  assert.deepEqual(extractSymbols("export const { a, b } = obj;\n").map((symbol) => symbol.name), ["a", "b"]);
  assert.deepEqual(extractSymbols("export const {\n  widget,\n  other,\n} = source;\n").map((symbol) => symbol.name), ["widget", "other"]);
  assert.deepEqual(extractSymbols("function local() {\n  return 1;\n}\nexport { local };\n"), [{ name: "local", kind: "local", start: 1, end: 3 }]);
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

function strictGit(diffText, contents) {
  return (_root, args) => {
    if (args[0] === "diff" || args[2] === "diff") return { ok: true, out: diffText };
    if (args[0] === "show") {
      const spec = args[args.length - 1];
      return { ok: Object.hasOwn(contents, spec), out: contents[spec] ?? "" };
    }
    return { ok: false, out: "" };
  };
}

test("a C-quoted diff header path is unescaped", () => {
  const git = strictGit('--- "a/we\\"ird.mjs"\n+++ "b/we\\"ird.mjs"\n@@ -0,0 +1,2 @@\n', {
    'abc:we"ird.mjs': "export function q() {\n  return 1;\n}\n",
  });
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["q"]);
});

test("the diff is read with core.quotePath disabled", () => {
  let seen = null;
  const git = (_root, args) => {
    seen = args;
    if (args[2] === "diff") return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  touchedSymbols({ root: ".", git, sha: "abc" });
  assert.deepEqual(seen.slice(0, 2), ["-c", "core.quotePath=false"]);
});

test("touchedSymbols maps changed lines to the symbol they fall inside", () => {
  const git = strictGit("--- a/scripts/lib/support/git-cli.mjs\n+++ b/scripts/lib/support/git-cli.mjs\n@@ -2,0 +3,1 @@\n", {
    "abc:scripts/lib/support/git-cli.mjs": "export function runGit(r) {\n  return 1;\n}\nexport const OTHER = 1;\n",
  });
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["runGit"]);
});

test("touchedSymbols reports a deleted symbol from the pre-image", () => {
  const git = strictGit("--- a/scripts/lib/support/git-cli.mjs\n+++ /dev/null\n@@ -1,3 +0,0 @@\n", {
    "abc^:scripts/lib/support/git-cli.mjs": "export function runGit(r) {\n  return 1;\n}\n",
  });
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["runGit"]);
});

test("touchedSymbols handles a path with spaces", () => {
  const git = strictGit("--- a/sub/a file.mjs\n+++ b/sub/a file.mjs\n@@ -0,0 +1,2 @@\n", {
    "abc:sub/a file.mjs": "export function spaced() {\n  return 1;\n}\n",
  });
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["spaced"]);
});
