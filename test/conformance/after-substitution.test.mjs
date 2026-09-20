import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCases, runConformance } from "../../scripts/lib/conformance/conformance.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

// A frozen case with an `after` block substitutes the fixture HEAD into the
// file it writes. The runner reads its fixture git result through the kernel
// process shape, so a field-name drift here turns every such case into a
// "Cannot read properties of undefined" throw instead of an acceptance verdict.
test("a frozen case with an after block substitutes the fixture HEAD", () => {
  const cases = loadCases(join(root, "config", "conformance.json")).filter((entry) => entry.id === "state-complete-with-evidence");
  assert.equal(cases.length, 1, "the frozen set must carry the state-complete-with-evidence case");
  const results = runConformance({ candidate: root, cases });
  assert.deepEqual(results, [{ id: "state-complete-with-evidence", ok: true, detail: "", exit: 0 }]);
});
