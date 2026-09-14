import assert from "node:assert/strict";
import test from "node:test";

import { lt5FixtureManifestErrors } from "../../scripts/lib/evaluation/lt5-fixtures.mjs";

const manifest = (over = {}) => ({
  tasks: [
    { id: "d1", mechanism: "serialization", stratum: "decisive", fixture_hash: "abcd1234", answer_hash: "efab5678", gold_passes: true, change_only_fails_on_dependency: true, neutral_partner: "n1" },
    { id: "d2", mechanism: "routing", stratum: "decisive", fixture_hash: "99998888", answer_hash: "77776666", gold_passes: true, change_only_fails_on_dependency: true, neutral_partner: "n2" },
    { id: "n1", mechanism: "serialization", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true },
    { id: "n2", mechanism: "routing", stratum: "neutral", fixture_hash: "55556666", answer_hash: "aaaabbbb", zero_trigger_hits: true },
  ],
  placebo: { already_satisfied: true },
  ...over,
});

test("a mechanism-distinct fixture manifest is accepted", () => {
  assert.deepEqual(lt5FixtureManifestErrors(manifest()), []);
});

test("two decisive tasks sharing a mechanism are rejected", () => {
  const errors = lt5FixtureManifestErrors(manifest({ tasks: [
    { id: "d1", mechanism: "routing", stratum: "decisive", fixture_hash: "abcd1234", answer_hash: "efab5678", gold_passes: true, change_only_fails_on_dependency: true, neutral_partner: "n1" },
    { id: "d2", mechanism: "routing", stratum: "decisive", fixture_hash: "99998888", answer_hash: "77776666", gold_passes: true, change_only_fails_on_dependency: true, neutral_partner: "n1" },
    { id: "n1", mechanism: "routing", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true },
  ] }));
  assert.ok(errors.some((error) => error.includes("already used")), JSON.stringify(errors));
});

test("a claim that gold passes or a key inside a bind is rejected", () => {
  const errors = lt5FixtureManifestErrors(manifest({ tasks: [
    { id: "d1", mechanism: "serialization", stratum: "decisive", fixture_hash: "abcd1234", answer_hash: "efab5678", gold_passes: false, change_only_fails_on_dependency: true, neutral_partner: "n1" },
    { id: "n1", mechanism: "serialization", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true, answer_key_inside_bind: true },
  ], placebo: { already_satisfied: false } }));
  assert.ok(errors.some((error) => error.includes("gold solution must pass")), JSON.stringify(errors));
  assert.ok(errors.some((error) => error.includes("inside an agent-readable bind")), JSON.stringify(errors));
  assert.ok(errors.some((error) => error.includes("placebo")), JSON.stringify(errors));
});

test("a self-partner or a decisive partner is not a neutral partner", () => {
  const errors = lt5FixtureManifestErrors(manifest({ tasks: [
    { id: "d1", mechanism: "serialization", stratum: "decisive", fixture_hash: "abcd1234", answer_hash: "efab5678", gold_passes: true, change_only_fails_on_dependency: true, neutral_partner: "d1" },
  ] }));
  assert.ok(errors.some((error) => error.includes("matched neutral partner")), JSON.stringify(errors));
});

test("an empty or duplicate-id manifest is rejected, not passed", () => {
  assert.deepEqual(lt5FixtureManifestErrors({ tasks: [], placebo: { already_satisfied: true } }), ["manifest.tasks must not be empty"]);
  const dup = manifest({ tasks: [{ id: "n1", mechanism: "serialization", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true }, { id: "n1", mechanism: "routing", stratum: "neutral", fixture_hash: "11112222", answer_hash: "33334444", zero_trigger_hits: true }] });
  assert.ok(lt5FixtureManifestErrors(dup).some((error) => error.includes("duplicate id")), JSON.stringify(lt5FixtureManifestErrors(dup)));
});
