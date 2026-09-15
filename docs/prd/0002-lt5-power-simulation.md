# PRD 0002: test the LT-5 promotion statistic before buying runs

Status: `absorbed` by the external LT-5 lab (`power-sim.mjs`, 2026-09-14); retained as a historical design note, not current work.

## Problem

LT-5 confirmation decides whether the content effect clears a minimum detectable
effect under a task-clustered design. The required N is asserted, not simulated,
so a falsely confident promotion cannot be detected before paying for runs.

## Deliverable

- `scripts/lib/evaluation/lt5-power.mjs`: simulate the registered design (paired
  binary outcomes, decisive/neutral strata, repeated measures within task, a
  task-clustered design effect) under fixed seeds and return null-rejection rate
  and power with Monte Carlo uncertainty.
- `docs/research/lt5-confirmation-design.json`: the frozen simulation
  parameters (alpha, target power, theta, ICC, design effect, candidate N).
- `test/evaluation/lt5-power.test.mjs`, added to the `test:lib` script.

## Acceptance criteria

- Duplicating repetitions without adding independent tasks does not increase the
  effective sample size; the analysis must not treat repeats as new tasks.
- Across fixed seeds, a candidate N is rejected unless null rejection is <= 5%
  and power is >= 80%.
- Monte Carlo uncertainty is reported, not a single point estimate.

## Cheapest falsifier

`node --test test/evaluation/lt5-power.test.mjs` fails RED if repeated measures
inflate power, and passes GREEN after the clustering fix.

## Non-goals

- No model calls and no LT-5 execution; this is a design-time simulation.
- Do not re-tune the estimand already registered in `docs/research/lab-tests.md`.
