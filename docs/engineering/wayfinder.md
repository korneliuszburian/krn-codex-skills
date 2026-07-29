# wayfinder

Chart one big, foggy, multi-session effort as a shared map of decision tickets and
resolve them one at a time until the way to the destination is clear.

## Use

When an idea is too large and uncertain for one session — the route from here to the
destination is not visible. It names the destination, maps the frontier breadth-first,
and works decision tickets (`research`, `prototype`, `grilling`, `task`) one per
session until nothing remains to decide. It plans; it does not build.

## Boundary

It clears fog upstream of execution. `$domain-modeling` sharpens
the destination and tickets; `$source-to-decision` resolves research tickets,
optionally consuming a validated `$second-opinion-review` research ledger;
`$to-spec`, `$slice-work`, and `$implement` take over once the way is clear; and
`$delivery-loop` owns lifecycle. If charting surfaces no fog, it makes no map and asks
how to proceed.

## Inputs

A loose idea too big for one session, plus the repo's configured tracker
(`docs/agents/issue-tracker.md`; local-markdown fallback).

## Output

One `wayfinder:map` artifact (index, not store) plus child decision tickets with
native blocking edges, worked frontier-first. When the route is clear it hands off to
`to-spec`, `slice-work`, or `implement` via `delivery-loop`.

## Composition

Grilling and domain-modeling name the destination and each grilling ticket;
source-to-decision resolves research tickets and retains adoption authority,
while second-opinion-review may provide only an explicitly requested advisory
source campaign. Cleared routes hand off to the spec/slice/implement spine
sequenced by delivery-loop.
