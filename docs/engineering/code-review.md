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

## Review precedence

| Lane | Trigger | Owner and result | Boundary |
|---|---|---|---|
| Local fixed-diff review | routine completed change | `code-review`; verified findings and residual risk | native review may run this contract, not add a second mandatory lane |
| GitHub review | an existing PR needs host feedback | GitHub lane; PR comments | optional; neither local Spec review nor approval |
| External second opinion | a high-risk challenger or bounded evidence campaign is explicitly requested | `second-opinion-review`; advisory evidence from exactly one backend per pass | never a gate, publisher, or product decision owner |
| Disposition | after any review | the initiating local workflow or human; accept, reject, evidence gap, or follow-up | the only lane that decides the next action |

One fixed point gets one routine local review lane. Additional host or external
lanes must have a distinct trigger and may not present their output as approval.
