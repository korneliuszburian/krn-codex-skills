import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORIZED_FAMILIES, admissibilityErrors, familyOf, isAdmissible } from "../../scripts/lib/evaluation/lt5-admissibility.mjs";

const record = (over = {}) => ({
  transport: "opencode",
  served_model: "opencode-go/deepseek-v4.1-flash",
  designation: "calibration",
  isolation: { ok: true, sentinel_leak: false, model_mismatch: false },
  ...over,
});

test("admits only the two authorized family/transport pairs", () => {
  assert.deepEqual(admissibilityErrors(record()), []);
  assert.deepEqual(admissibilityErrors(record({ transport: "codex", served_model: "gpt-5.6-luna" })), []);
  assert.equal(familyOf(record()), "deepseek");
  assert.equal(familyOf(record({ transport: "codex", served_model: "gpt-5.6-luna" })), "luna");
  assert.equal(AUTHORIZED_FAMILIES.length, 2);
});

test("rejects a model on the wrong transport or outside the authorized set", () => {
  assert.deepEqual(
    admissibilityErrors(record({ transport: "opencode", served_model: "gpt-5.6-luna" })),
    ["unauthorized family/transport: opencode/gpt-5.6-luna"],
  );
  assert.deepEqual(
    admissibilityErrors(record({ transport: "codex", served_model: "gpt-6-astra" })),
    ["unauthorized family/transport: codex/gpt-6-astra"],
  );
  assert.equal(isAdmissible(record({ transport: "opencode", served_model: "opencode-go/glm-5.3" })), false);
});

test("rejects missing provenance, wrong designation, and false isolation claims", () => {
  assert.deepEqual(admissibilityErrors(null), ["record is not an object"]);
  assert.deepEqual(admissibilityErrors(record({ transport: "" })), ["missing transport"]);
  assert.deepEqual(admissibilityErrors(record({ served_model: "" })).includes("missing served_model"), true);
  assert.deepEqual(admissibilityErrors(record({ designation: "exploratory" })), ["designation must be calibration or confirmation"]);
  assert.deepEqual(
    admissibilityErrors(record({ isolation: { ok: true, sentinel_leak: true, model_mismatch: true } })),
    ["isolation sentinel_leak must be false", "isolation model_mismatch must be false"],
  );
  assert.equal(isAdmissible(record({ isolation: {} })), false);
});
