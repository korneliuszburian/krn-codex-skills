# Brief

Compiled from the outcome capsule, the workflow lessons, and the lab-test registry. Do not edit by hand; regenerate with `krn brief --root . --write`.

## Objective

[the KRN harness is consolidated into one coherent architecture with a single owner per primitive and one compiled memory substrate and one gate list; pass, every change lands through a lane PR with green CI and a Change-contract trailer; pass, dead and self-referential knowledge artifacts are deleted so net surface shrinks each pass; pass, a frozen harness-vs-vanilla measurement with ablation shows gain not status; pass, the boundary stays clean with zero PRs and worktrees and branches and a clean capsule and ticket check zero errors; pass, work happens only in the durable canonical checkout; todo]

Outcome state: ACTIVE

## Invariants

- One owner per primitive; a meaning implemented twice is a defect.
- One writer per outcome; independent work is read-only.
- Every durable pattern carries a trigger and a falsifier; a pattern with no reader is deleted.
- Gain is measured against a frozen baseline, never asserted.
- Deletion is progress.

## Patterns in force

- 24 active lessons in docs/research/workflow-lessons.md
- triggers: symbol:frozenRedOk; path:scripts/lib/lessons/**; churn:scripts/lib/contract/change-contract.mjs; path:src/css/blocks/**; path:docs/design/**; path:components/**; path:docs/design/enforcement.md

## Measurements

- 100 lab-test rows; latest: LT-96, LT-97, LT-98, LT-99, LT-100
- the paired harness-vs-vanilla run on the frozen denominator is a recorded non-proof until it lands

## Retired

- Verification lanes on this host cannot spawn git children, so state tests run only in the main session.
