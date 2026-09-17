Status: superseded — the evaluation modules this brief targeted were retired (commit 26fec20); kept as a design record.

# PRD 0005: reproducible LT-1 scale-up

## Problem

The LT-1 result rests on four decisive tasks, one repetition, no neutral stratum,
and fixtures or answer keys that were not retained, so it is not independently
reproducible and cannot separate memory from generic priming.

## Deliverable

- `test/evaluation/lt1-fixtures/manifest.json`: each task's fixture hash, an
  answer-key hash, its stratum (decisive or neutral), at least three repetitions,
  a length-matched placebo row, and the family it runs on.
- `scripts/lib/evaluation/check-lt1-fixtures.mjs` plus a test in the `test:lib`
  script: validate the manifest against the criteria below.

## Acceptance criteria

- Fixture and answer-key hashes are committed; keys stay outside every
  agent-readable bind.
- Every decisive task has at least three planned repetitions and a matched
  neutral task of the same shape.
- A neutral task returns zero hits under `memory recall`.
- The placebo row is length-matched to arm B and is already satisfied with no
  lesson applied.

## Cheapest falsifier

`node --test test/evaluation/check-lt1-fixtures.test.mjs` fails RED when a fixture
has no retained key hash or no neutral partner, and passes GREEN after the fix.

## Non-goals

- Do not run the fixtures here; this only makes the scale-up verifiable.
- Do not duplicate the LT-5 fixture manifest; LT-1 covers the earlier four-task
  result, LT-5 covers the confirmation design.
