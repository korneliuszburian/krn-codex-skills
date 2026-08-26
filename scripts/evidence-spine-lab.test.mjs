import test from "node:test";
import assert from "node:assert/strict";

import { runLab } from "./evidence-spine-lab.mjs";

test("EvidenceSpine lab distinguishes loose handoff from bound receipt", () => {
  const result = runLab();

  assert.equal(result.traces, 6);
  assert.equal(result.control.false_acceptances, 2);
  assert.equal(result.control.retry_identity_missing, 2);
  assert.equal(result.control.feedback.duplicates, 6);
  assert.equal(result.treatment.receipts, 4);
  assert.equal(result.treatment.mismatch_rejections, 2);
  assert.equal(result.treatment.retry_identity_verified, 2);
  assert.equal(result.treatment.feedback.duplicates, 0);
  assert.equal(result.treatment.feedback.duplicate_attempts, 4);
  assert.equal(result.treatment.receipts_without_verifier, 0);
  assert.equal(result.all_acceptance_criteria_pass, true);
});

test("EvidenceSpine lab is deterministic and stays within the transport budget", () => {
  const first = runLab();
  const second = runLab();

  assert.deepEqual(first, second);
  assert.equal(first.acceptance.overhead_within_20_percent, true);
});
