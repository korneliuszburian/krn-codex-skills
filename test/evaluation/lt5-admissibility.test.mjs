import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORIZED_FAMILIES,
  admissibilityErrors,
  familyOf,
  isAdmissible,
  normalizeFlag,
  parseServedLine,
  parseServedModel,
  partitionAdmissible,
  recordFromRun,
  transportFromProvider,
} from "../../scripts/lib/evaluation/lt5-admissibility.mjs";

const record = (over = {}) => ({
  transport: "opencode",
  provider: "opencode-go",
  served_model: "deepseek-v4.1-flash",
  designation: "calibration",
  isolation: { ok: true, sentinel_leak: false, model_mismatch: false },
  ...over,
});

const lunaRecord = (over = {}) => record({ transport: "codex", provider: "codex", served_model: "gpt-5.6-luna", ...over });

test("admits only the two authorized family/transport pairs", () => {
  assert.deepEqual(admissibilityErrors(record()), []);
  assert.deepEqual(admissibilityErrors(lunaRecord()), []);
  assert.equal(familyOf(record()), "deepseek");
  assert.equal(familyOf(lunaRecord()), "luna");
  assert.equal(AUTHORIZED_FAMILIES.length, 2);
});

test("derives the transport from providerID, so luna-via-opencode stays quarantined", () => {
  assert.equal(transportFromProvider("opencode-go"), "opencode");
  assert.equal(transportFromProvider("codex"), "codex");
  assert.equal(transportFromProvider("other"), "");
  assert.deepEqual(parseServedLine("providerID=opencode-go modelID=deepseek-v4.1-flash"), {
    transport: "opencode",
    provider: "opencode-go",
    served_model: "deepseek-v4.1-flash",
  });

  const authorized = recordFromRun({
    line: "providerID=opencode-go modelID=deepseek-v4.1-flash",
    designation: "calibration",
    isolation: { ok: true, sentinel_leak: "no", model_mismatch: "no" },
  });
  assert.equal(isAdmissible(authorized), true);

  const quarantined = recordFromRun({
    line: "providerID=opencode-go modelID=gpt-5.6-luna",
    designation: "calibration",
    isolation: { ok: true, sentinel_leak: "no", model_mismatch: "no" },
  });
  assert.equal(quarantined.transport, "opencode");
  assert.deepEqual(admissibilityErrors(quarantined), ["unauthorized family/transport: opencode/gpt-5.6-luna"]);
});

test("a hand-built transport cannot contradict its provider", () => {
  const spoof = { transport: "codex", provider: "opencode-go", served_model: "gpt-5.6-luna", designation: "confirmation", isolation: { ok: true, sentinel_leak: false, model_mismatch: false } };
  assert.deepEqual(admissibilityErrors(spoof), ["transport does not match provider: codex/opencode-go"]);
  assert.deepEqual(admissibilityErrors(record({ provider: "" })).includes("missing provider"), true);
});

test("normalizes the runner's no/YES tokens at the producer boundary", () => {
  assert.equal(normalizeFlag("no"), false);
  assert.equal(normalizeFlag("YES"), true);
  assert.equal(normalizeFlag(true), true);
  assert.equal(normalizeFlag("huh"), undefined);
  assert.equal(isAdmissible(record({ isolation: { ok: true, sentinel_leak: "no", model_mismatch: "no" } })), true);
  assert.deepEqual(admissibilityErrors(record({ isolation: { ok: true, sentinel_leak: "YES", model_mismatch: "no" } })), [
    "isolation sentinel_leak must be false",
  ]);
});

test("admits a record built from the documented runner line", () => {
  assert.equal(parseServedModel("providerID=opencode-go modelID=deepseek-v4.1-flash"), "deepseek-v4.1-flash");
  assert.equal(parseServedModel("no model here"), "");
});

test("rejects a model on the wrong transport or outside the authorized set", () => {
  assert.deepEqual(admissibilityErrors(record({ served_model: "gpt-5.6-luna" })), ["unauthorized family/transport: opencode/gpt-5.6-luna"]);
  assert.deepEqual(admissibilityErrors(lunaRecord({ served_model: "gpt-6-astra" })), ["unauthorized family/transport: codex/gpt-6-astra"]);
  assert.equal(isAdmissible(record({ served_model: "glm-5.3" })), false);
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

test("partitions a mixed record set before pooling", () => {
  const good = record();
  const bad = record({ served_model: "glm-5.3" });
  const { admissible, rejected } = partitionAdmissible([good, bad]);
  assert.deepEqual(admissible, [good]);
  assert.equal(rejected.length, 1);
  assert.deepEqual(rejected[0].errors, ["unauthorized family/transport: opencode/glm-5.3"]);
  assert.deepEqual(partitionAdmissible(undefined), { admissible: [], rejected: [] });
});

test("partitions by a target designation and family", () => {
  const calibration = record({ designation: "calibration" });
  const confirmation = record({ designation: "confirmation" });
  const otherFamily = lunaRecord({ designation: "confirmation" });
  const { admissible, rejected } = partitionAdmissible([calibration, confirmation, otherFamily], { designation: "confirmation", family: "deepseek" });
  assert.deepEqual(admissible, [confirmation]);
  assert.deepEqual(rejected.map((entry) => entry.errors).flat(), [
    "designation calibration is not confirmation",
    "family luna is not deepseek",
  ]);
});
