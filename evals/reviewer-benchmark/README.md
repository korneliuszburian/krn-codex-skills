# Reviewer Benchmark

Standing, deterministic benchmark for the review lanes of this repository. It
answers one question: does a review lane actually catch the defect classes a
senior human reviewer would name — and is it getting better or worse over time?

This is a specialized standing benchmark, not a generic experiment record.
Its fixed subject, scorer, and committed `results/` remain authoritative for
this lane. The generic lifecycle in [`evals/README.md`](../README.md) governs
new bounded experiments and does not replace or duplicate this scorer.

## Provenance

- `subject/` and `oracle/evaluation-rubric.md` are copied verbatim from the
  `reviewer-quality-poc` repository (one fixed subject with five planted defect
  classes, one hidden human-weighted rubric 0–10).
- `review-inputs/codex-reviewer-output.json` is the retained output of the
  original Codex reviewer measurement (hand-scored 4.5/10 there).
- The scorer in `scripts/score-review.mjs` is a deterministic keyword/evidence
  proxy for that hidden rubric. It is not the human rubric; where the two
  differ (baseline: 5.5 heuristic vs 4.5 hand) the heuristic is recorded with
  the deviation noted.

## Commands

```bash
npm run benchmark:reviewer -- score <review.json>      # score a JSON review artifact
npm run benchmark:reviewer -- score-prose <opinion.txt> # score a prose opinion lane
npm run benchmark:reviewer -- summary                  # aggregated results
npm run test:benchmark                                 # scorer falsifier tests
```

`run` mode executes a lane command that must emit a review JSON to a declared
path, then scores and records it under `results/`.

## Gate rule

A lane whose score stays below **5/10** on the fixed subject cannot act as the
review gate lane for `$delivery-loop`. Prompt or rubric changes to a lane must
not regress the recorded score; regressions are review-blocking.

## Structure

- `subject/` — fixed review target (billing alert router with planted defects).
- `oracle/` — hidden rubric; do not ship it to a reviewed lane.
- `review-inputs/` — retained artifacts and the machine review schema.
- `scripts/` — scorer, runner, falsifier tests.
- `results/` — durable per-lane records (committed evidence).
