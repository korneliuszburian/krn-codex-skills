import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(root, relative), "utf8");

test("the repository contract documents the audit and the gate tiers", () => {
  const page = read("AGENTS.md");
  for (const token of ["quality:audit", "gate:fast", "gate:deep"]) {
    assert.ok(page.includes(token), `AGENTS.md local gates must name ${token}`);
  }
});
