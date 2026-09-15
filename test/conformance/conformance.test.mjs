import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { caseIds, loadCases, runConformance } from "../../scripts/lib/conformance/conformance.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const casesFile = join(root, "config", "conformance.json");

test("the frozen case set loads and every case is complete", () => {
  const cases = loadCases(casesFile);
  assert.ok(cases.length >= 11, `expected the frozen set, found ${cases.length}`);
  const groups = new Set(cases.map((entry) => entry.run[0]));
  for (const group of ["changes", "lessons", "memory", "skills", "state"]) {
    assert.ok(groups.has(group), `the frozen set must cover the ${group} seam`);
  }
  assert.equal(caseIds(casesFile).has("changes-docs-only-accepted"), true);
});

test("an incomplete case is rejected rather than silently skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-conformance-cases-"));
  const file = join(dir, "cases.json");
  writeFileSync(file, JSON.stringify({ cases: [{ id: "bad", steps: [{ files: {} }], run: ["changes", "check"] }] }));
  assert.throws(() => loadCases(file), /expect\.exit/);
  rmSync(dir, { recursive: true, force: true });
});

test("caseIds reports a missing manifest as null", () => {
  assert.equal(caseIds(join(tmpdir(), "krn-conformance-absent", "cases.json")), null);
});

test("a positive public-seam case passes against this checkout", () => {
  const cases = loadCases(casesFile).filter((entry) => entry.id === "changes-docs-only-accepted");
  const results = runConformance({ candidate: root, cases });
  assert.deepEqual(results, [{ id: "changes-docs-only-accepted", ok: true, detail: "", exit: 0 }]);
});

test("a candidate whose CLI misbehaves is reported as a failure", () => {
  const candidate = mkdtempSync(join(tmpdir(), "krn-conformance-bad-"));
  mkdirSync(join(candidate, "scripts"), { recursive: true });
  writeFileSync(join(candidate, "scripts", "krn-codex.mjs"), "process.exit(3);\n");
  const cases = loadCases(casesFile).filter((entry) => entry.id === "changes-docs-only-accepted");
  const results = runConformance({ candidate, cases });
  assert.equal(results[0].ok, false);
  assert.match(results[0].detail, /exit 3, expected 0/);
  rmSync(candidate, { recursive: true, force: true });
});
