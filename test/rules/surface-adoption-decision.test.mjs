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

test("the knowledge map links the surface-adoption ADR", () => {
  assert.match(read("CONTEXT.md"), /docs\/adr\/0006-keep-the-krn-surfaces\.md/, "CONTEXT must link the ADR");
});

test("the adoption ledger carries the surface row with an expiry", () => {
  const ledger = read("docs/research/orchestration.md");
  const row = ledger
    .split("\n")
    .find((line) => line.startsWith("| KRN surfaces (skills, brief, hooks, memory) as the default |"));
  assert.ok(row, "the ledger must carry the surface-adoption row");
  const cells = row.slice(1, -1).split("|").map((cell) => cell.trim());
  assert.equal(cells.length, 5, "the row must carry all five ledger cells");
  assert.match(cells[3], /^\d{4}-\d{2}-\d{2}$/, "the row must carry an expiry date");
  assert.ok(cells[4].length > 0, "the row must carry a retirement trigger");
});
