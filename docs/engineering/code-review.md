# Code Review

## Purpose

Independently review one fixed diff on separate Standards and Spec axes without
editing the reviewed source.

## Invocation

Model-invocable or explicit as `$code-review`.

## Use and skip

Use for a resolvable commit, branch, pull request, or working tree whose change
is ready to judge. Skip implementation, diagnosis, and open-ended exploration.

## Inputs

A fixed comparison, its acceptance authority, repository instructions, and any
explicitly excluded paths.

## Output and completion

A severity-ordered finding report, path ledger, observed checks, proof gaps,
and residual risk. Completion requires every in-scope path and both review axes
to be accounted for while the reviewed source remains unchanged.

## Composition

Usually follows `$implement`. Accepted findings return as a separately scoped
implementation task. A parent workflow may retain a consumer-owned report
under `docs/agents/reports/code-review/`.
