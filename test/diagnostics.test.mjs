import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagnostics, toLine } from "../scripts/lib/diagnostics.mjs";

test("toLine normalizes string and record diagnostics", () => {
  assert.equal(toLine("plain"), "plain");
  assert.equal(toLine({ rule: "missing-field", detail: "Authority" }), "missing-field: Authority");
  assert.equal(toLine({ rule: "x" }), "x");
  assert.equal(toLine({}), "unknown");
});

test("renderDiagnostics normalizes both lists and tolerates missing ones", () => {
  const report = renderDiagnostics({ errors: [{ rule: "a", detail: "b" }, "c"], warnings: ["w"] });
  assert.deepEqual(report.errors, ["a: b", "c"]);
  assert.deepEqual(report.warnings, ["w"]);
  assert.deepEqual(renderDiagnostics({}), { errors: [], warnings: [] });
});
