# PRD 0004: cost-paired memory measurement

## Problem

LT-1 records outcome by arm but not serving cost per success: the only cost
ordering on record is codex tokens, and the page states that serving cost is not
inferable from context length (arXiv:2608.11879). A content arm that wins on
outcome but loses on cost per success cannot be told apart from a winner.

## Deliverable

- `scripts/lib/evaluation/cost-paired.mjs`: given per-run records
  `{ task, arm, tokens_in, tokens_out, wall_seconds, held_out_pass }`, compute
  cost per success per arm and a paired per-task cost/outcome delta.
- `test/evaluation/cost-paired.test.mjs`, added to the `test:lib` script.

## Acceptance criteria

- A run with no captured tokens is flagged as unmeasured, never counted as zero
  cost.
- Cost per success is defined as total grouped cost over held-out passes, and is
  reported per arm with the task count it rests on.
- The per-task delta is paired within task, not an arm-mean difference.
- Cost is never derived from context length.

## Cheapest falsifier

`node --test test/evaluation/cost-paired.test.mjs` fails RED when a token-less run
is treated as free, and passes GREEN after the fix.

## Non-goals

- No live runs and no model calls; input is a result fixture.
- Do not re-open the LT-1 outcome decision; this only adds the cost axis.
