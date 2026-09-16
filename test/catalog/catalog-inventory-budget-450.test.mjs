import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const modulePath = fileURLToPath(new URL("../../scripts/lib/catalog/catalog-inventory.mjs", import.meta.url));
const LINE_BUDGET = 450;

test("catalog-inventory.mjs stays within the line budget", () => {
  const content = fs.readFileSync(modulePath, "utf8");
  const lineCount = content.replace(/\n$/, "").split("\n").length;
  assert.ok(
    lineCount <= LINE_BUDGET,
    `scripts/lib/catalog/catalog-inventory.mjs has ${lineCount} lines; the budget is ${LINE_BUDGET}`,
  );
});
