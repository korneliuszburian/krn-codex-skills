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

test("the tier scripts keep the union the contract promises", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  const steps = (command) => command.split("&&").map((step) => step.trim().replace(/^npm run /, "")).filter(Boolean);
  const union = new Set([...steps(scripts["gate:fast"]), ...steps(scripts["gate:deep"])]);
  const gate = new Set(steps(scripts.gate));
  for (const step of union) assert.ok(gate.has(step), `gate must still run ${step}`);
  assert.ok(gate.has("quality:audit"), "the aggregate gate must run the quality audit");
});
