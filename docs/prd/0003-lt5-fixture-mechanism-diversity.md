# PRD 0003: mechanism-distinct LT-5 fixtures

## Problem

The LT-5 task shapes are structure-matched but not mechanism-distinct, so a
result may reflect one dependency mechanism rather than transfer. Renamed
couplings do not test transfer across mechanisms.

## Deliverable

- `test/evaluation/lt5-fixtures/manifest.json`: for each task the dependency
  mechanism (serialization, routing, media membership), its decisive and neutral
  variants, the answer key hash, and the placebo that is already satisfied.
- `scripts/lib/evaluation/check-lt5-fixtures.mjs` plus a test in the `test:lib`
  script: validate the manifest against the criteria below.

## Acceptance criteria

- Each mechanism's gold solution passes; a change that omits the dependency fails
  solely on that dependency.
- A neutral task returns zero trigger hits under `memory recall`.
- The placebo convention already passes with no lesson applied.
- Answer keys are stored outside every agent-readable bind and carry a committed
  salted hash.

## Cheapest falsifier

`node --test test/evaluation/check-lt5-fixtures.test.mjs` fails RED when two tasks
share a mechanism or a neutral task matches a trigger, and passes GREEN after the
fixtures are corrected.

## Non-goals

- Do not run the fixtures; this PRD only makes them verifiable.
- Freeze the confirmation pool before any calibration outcome can influence
  item selection.
