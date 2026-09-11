# ADR 0002: Lifecycle transition table

- Status: accepted
- Date: 2026-09-10
- Decision owner: KRN skill-system maintainer
- Evidence: [orchestration synthesis](../research/orchestration.md) and the
  2026-09-10 harness audits

## Context

Routing truth was duplicated across the README workflow graph, the research
admission table, `$delivery-loop` step 2, and individual skill descriptions.
The three audits found nine of twelve natural requests ambiguous between
descriptions and two disposition drifts caused by the same duplication. The
repository-scoped export had also copied the whole upstream pin
because no artifact defined which owners the lifecycle actually uses.

## Decision

The harness is its transition table. One canonical table lives at
`skills/engineering/delivery-loop/references/transitions.md` and names, for each
unresolved condition, exactly one handler and its return boundary. The
repository-scoped baseline is derived from the handler column: a skill enters
`manifest.harness_skills` or the upstream `harness_paths` only when a transition
names it. `npm run validate` fails when the table, the manifest, and the pin
disagree about the baseline, when a handler is unknown, or when a handler
appears twice. Companions stay cross-cutting and never own a transition.

## Consequences

- Skill count becomes a consequence of distinct lifecycle conditions, not of
  catalog ambition; the current baseline is thirteen handlers.
- Research and README pages point at the table instead of restating it.
- Routing changes are one-table edits with a mechanical gate, not prose sweeps.
- Adding a skill requires naming its transition; removing a transition requires
  retiring its handler from the baseline.

## Rejected alternatives

- Keep routing prose in README plus research plus each skill, and curate by
  hand: already failed twice, with recorded drift.
- Keep the full upstream pin in the baseline: routing ambiguity and a 35-skill
  index do not match the lifecycle's real condition set.
- A central router skill: the transition table is data validated by the
  existing gate, not another workflow owner.

## Supersession rule

Replace this ADR when a measured routing or baseline failure cannot be fixed by
editing the table and its gate, or when the lifecycle gains a condition that the
table cannot express without a second routing source.
