import assert from "node:assert/strict";
import test from "node:test";

import { fixtureManifestErrors } from "../../scripts/lib/evaluation/lt1-fixtures.mjs";

const manifest = (over = {}) => ({
  tasks: [
    { id: "d1", stratum: "decisive", fixture_hash: "abcd1234", answer_hash: "efab5678", reps: 3, neutral_partner: "n1" },
    { id: "n1", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true },
  ],
  placebo: { length_matched: true, already_satisfied: true },
  ...over,
});

test("a complete fixture manifest is accepted", () => {
  assert.deepEqual(fixtureManifestErrors(manifest()), []);
});

test("a fixture without a retained key hash or neutral partner is rejected", () => {
  const errors = fixtureManifestErrors(manifest({ tasks: [{ id: "d1", stratum: "decisive", fixture_hash: "abcd1234", reps: 3, neutral_partner: "missing" }] }));
  assert.ok(errors.some((error) => error.includes("missing retained answer-key hash")), JSON.stringify(errors));
  assert.ok(errors.some((error) => error.includes("matched neutral partner")), JSON.stringify(errors));
});

test("a key inside a bind or a thin placebo is rejected", () => {
  const errors = fixtureManifestErrors(manifest({ tasks: [{ id: "n1", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", answer_key_inside_bind: true }], placebo: { length_matched: false, already_satisfied: true } }));
  assert.ok(errors.some((error) => error.includes("inside an agent-readable bind")), JSON.stringify(errors));
  assert.ok(errors.some((error) => error.includes("length-matched")), JSON.stringify(errors));
  assert.equal(fixtureManifestErrors(null)[0], "manifest must be an object");
});

test("a neutral task that triggers a lesson is rejected", () => {
  const errors = fixtureManifestErrors(manifest({ tasks: [{ id: "n1", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: false }] }));
  assert.ok(errors.some((error) => error.includes("zero trigger hits")), JSON.stringify(errors));
});

test("an empty or duplicate-id manifest is rejected, not passed", () => {
  assert.deepEqual(fixtureManifestErrors({ tasks: [], placebo: { length_matched: true, already_satisfied: true } }), ["manifest.tasks must not be empty"]);
  const dup = manifest({ tasks: [{ id: "n1", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true }, { id: "n1", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true }] });
  assert.ok(fixtureManifestErrors(dup).some((error) => error.includes("duplicate id")), JSON.stringify(fixtureManifestErrors(dup)));
});
