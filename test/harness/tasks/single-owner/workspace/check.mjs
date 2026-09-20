import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { pattern } from "./lib/use.mjs";
test("the regexp escaper has one owner and still works", () => {
  const owners = readdirSync("./lib").filter((file) => readFileSync(`./lib/${file}`, "utf8").includes("export const escapeRegExp"));
  assert.deepEqual(owners, ["escape-a.mjs"]);
  assert.equal(pattern("a.b").test("a.b"), true);
  assert.equal(pattern("a.b").test("axb"), false);
});
