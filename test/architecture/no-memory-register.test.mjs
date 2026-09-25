import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const exists = (relative) => fs.existsSync(path.join(root, relative));

test("the memory register and its observer are deleted", () => {
  assert.ok(!exists("docs/research/memory-register.md"), "the register page must be deleted");
  assert.ok(!exists("scripts/lib/memory-register.mjs"), "the register observer must be deleted");
  assert.ok(!exists("test/rules/memory-register.test.mjs"), "the register test must be deleted");
});
