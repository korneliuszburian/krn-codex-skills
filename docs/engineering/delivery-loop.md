# Delivery Loop

## Purpose

Carry one accepted repository outcome through claim, implementation, proof,
independent review, and its authorized publication state without duplicating
the workflow owners for any stage.

## Invocation

Model- or user-invoked for autonomous end-to-end delivery. Use `$delivery-loop`
explicitly when the outcome should continue across several lifecycle stages.

## Use / skip

Use for one accepted result that must be driven until local completion, PR/CI,
or an exact external blocker. Skip a single already-scoped edit, diagnosis-only
request, fixed-point review, or publication-only request.

## Inputs

Outcome and acceptance, repository/tracker state, owned paths, required proof,
delivery profile, and separate authority for commit, push, PR, merge, and deploy.

## Output and completion

An evidence-backed lifecycle state: local complete, publication pending, PR
open, merge ready, done, or a precise blocker. Completion includes tracker/goal
truth, proof, Standards/Spec disposition, host state, and artifact cleanup.

## Composition

Routes clear changes to `implement`, unknown failures to `diagnosing-bugs`, and
fixed results to `code-review`. Publication and failing-CI work stay with their
installed GitHub owners. It never becomes an executioner, reviewer, tracker, or
publisher itself.
