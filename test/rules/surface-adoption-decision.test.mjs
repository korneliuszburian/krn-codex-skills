import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ADR = "docs/adr/0006-keep-the-krn-surfaces.md";
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

test("the surface-adoption decision is an accepted ADR with a supersession rule", () => {
  assert.ok(existsSync(path.join(root, ADR)), `${ADR} must exist`);
  const text = read(ADR);
  assert.match(text, /Status: accepted/, "the decision must be accepted");
  assert.match(text, /Keep the KRN surfaces as the default/, "the decision must be stated");
  assert.match(text, /Supersession rule/, "the decision must name its reopening rule");
  assert.match(text, /LT-102 through LT-105|LT-103/, "the decision must cite the measurement evidence");
});
