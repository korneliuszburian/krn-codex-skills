# PRD 0001: score the judge swarm with seeded faults

## Problem

A judge round that returns `NO FINDINGS` is treated as evidence of correctness,
but the harness has never measured the swarm's detection sensitivity. Silence is
not a measurement.

## Deliverable

- `test/evaluation/blind-mutations.json`: a set of seeded faults plus matched
  clean controls. Each entry names a historical bypass (a commit that shipped a
  real defect the gates later had to catch), the file and hunk that reintroduces
  it, and a control snapshot with the fault absent.
- `scripts/lib/evaluation/score-mutations.mjs` (imported by the test below):
  given judge verdicts keyed by mutation id, count a missed fault as a false
  negative, an accusation against a clean control as a false positive, and return
  `{ falseNegatives, falsePositives, sensitivity, specificity }`.
- `test/evaluation/score-mutations.test.mjs`, added to the `test:lib` script.

## Acceptance criteria

- Replaying one known bypass: the existing gate rejects the mutant snapshot and
  accepts the clean control.
- The scorer counts that rejected mutant as a true positive and a clean control
  with no finding as a true negative.
- A mutant with no finding is a false negative; a control with a finding is a
  false positive.
- The mutation key is not readable by a judge during a scored round.

## Cheapest falsifier

`node --test test/evaluation/score-mutations.test.mjs` fails RED when the scorer
treats a missed mutant as a pass, and passes GREEN after the fix.

## Non-goals

- No live model calls in the unit test; verdicts are fixtures.
- Do not change the 18 gates or `docs/research/lab-tests.md`.
