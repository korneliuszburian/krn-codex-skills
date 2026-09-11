import assert from "node:assert/strict";
import test from "node:test";

import { changedLineNumbers, extractSymbols, touchedSymbols } from "../scripts/lib/symbol-triggers.mjs";

test("extractSymbols finds exported declarations with spans", () => {
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
  const symbols = extractSymbols(source);
  assert.deepEqual(symbols.map((symbol) => symbol.name), ["runGit", "VALUE", "Thing"]);
  assert.deepEqual(symbols[0], { name: "runGit", kind: "function", start: 2, end: 4 });
  assert.deepEqual(symbols[1], { name: "VALUE", kind: "const", start: 6, end: 6 });
});

test("changedLineNumbers parses zero-context hunks", () => {
  const lines = changedLineNumbers("@@ -1,2 +1,3 @@\n@@ -10 +11 @@\n");
  assert.deepEqual([...lines].sort((a, b) => a - b), [1, 2, 3, 11]);
});

test("touchedSymbols maps changed lines to the symbol they fall inside", () => {
  const git = (_root, args) => {
    if (args[0] === "diff") return { ok: true, out: "+++ b/scripts/lib/git-cli.mjs\n@@ -2,0 +3,1 @@\n" };
    if (args[0] === "show") return { ok: true, out: "export function runGit(r) {\n  return 1;\n}\nexport const OTHER = 1;\n" };
    return { ok: false, out: "" };
  };
  assert.deepEqual(touchedSymbols({ root: ".", git, sha: "abc" }), ["runGit"]);
});
