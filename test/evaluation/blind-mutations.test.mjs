import assert from "node:assert/strict";
import test from "node:test";

import { scoreVerdicts, summarizeSensitivity } from "../../scripts/lib/evaluation/blind-mutations.mjs";

test("scores mutants and controls, not raw verdict counts", () => {
  const result = scoreVerdicts({ mutants: ["m1", "m2", "m3"], controls: ["c1", "c2"], findings: { m1: true, m2: false, m3: true, c1: false, c2: true } });
  assert.deepEqual(result, { truePositives: 2, falseNegatives: 1, falsePositives: 1, trueNegatives: 1, sensitivity: 2 / 3, specificity: 0.5 });
});

test("a missed mutant is a false negative, not a silent pass", () => {
  const result = scoreVerdicts({ mutants: ["m1"], controls: ["c1"], findings: {} });
  assert.equal(result.falseNegatives, 1);
  assert.equal(result.sensitivity, 0);
  assert.equal(summarizeSensitivity(result).ok, false);
});

test("an empty mutant set leaves sensitivity unmeasured", () => {
  const result = scoreVerdicts({ mutants: [], controls: ["c1"], findings: {} });
  assert.equal(result.sensitivity, null);
  assert.equal(summarizeSensitivity(result).ok, false);
  assert.equal(summarizeSensitivity(scoreVerdicts({ mutants: ["m1"], controls: ["c1"], findings: { m1: true, c1: false } })).ok, true);
});

test("a reserved mutation id is not counted as a reported finding", () => {
  assert.deepEqual(scoreVerdicts({ mutants: ["toString"], controls: [], findings: {} }), {
    truePositives: 0,
    falseNegatives: 1,
    falsePositives: 0,
    trueNegatives: 0,
    sensitivity: 0,
    specificity: null,
  });
  assert.equal(scoreVerdicts({ mutants: [], controls: ["constructor"], findings: {} }).falsePositives, 0);
});
