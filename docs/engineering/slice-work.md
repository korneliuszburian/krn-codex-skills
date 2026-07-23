# slice-work

Decompose one settled spec or decision into implementation-ready vertical slices.

## Use

When a settled outcome must become a slice list before implementation. It turns a
destination-first spec into vertical slices that `implement` can pick up one per
fresh-context session.

## Boundary

It produces the slice list; it never executes a slice. `implement` owns one
slice, `delivery-loop` owns the lifecycle and claim state, and `domain-modeling`
owns vocabulary. If decisions are still fog, it stops and routes to
`domain-modeling` rather than slicing uncertainty.

## Inputs

A settled spec with resolved decisions and explicit non-goals — the kind of
artifact a planning step produces.

## Output

A slice list where each slice is one-fresh-session-sized, runs caller to public
seam to result, states real blocking dependencies, and carries its own decision
evidence. A tracer-bullet slice makes the outcome demonstrable first; later
slices each add one independent capability. No slice is a horizontal layer; the
one exception is a wide refactor, sequenced as expand–contract. When a tracker is
configured, each slice is also published as one ticket with its blocking edges for
`delivery-loop` to claim.

## Composition

Hand each slice to `implement` in a fresh context; `delivery-loop` claims the
frontier and sequences the list under its work-in-progress limit. `slice-work`
creates the tickets; it never claims or sequences them.
