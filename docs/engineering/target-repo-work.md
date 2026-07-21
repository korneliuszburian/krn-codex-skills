# Target Repo Work

## Purpose

Preserve identity, dirty-state ownership, and authority when observing or
changing a repository other than the active source checkout.

## Invocation

Model-invocable or explicit as `$target-repo-work`.

## Use and skip

Use whenever commands or edits cross into another checkout. Skip normal work
inside the active repository.

## Inputs

Canonical target path and ref, mode, exact observer or requested outcome,
owned path budget, pre-existing dirty state, operator requirements, and
publication boundary.

## Output and completion

For observation, an identity-bound result with unchanged before/after state.
For authorized writes, an attributable mutation ledger, focused proof, and
explicit handoff or publication state.

## Composition

Wraps the target boundary, then delegates unknown causes to
`$diagnosing-bugs`, scoped changes to `$implement`, or setup adoption to
`$setup-repository-workflow`.
