---
name: slice-work
description: Turn a settled spec into implementation-ready vertical slices — each one-fresh-session-sized with explicit blocking dependencies — and publish them as tracker tickets when configured. Use before implementation; skip unresolved fog, single edits, and execution.
---

# Slice Work

Produce the slice list; never execute it. `implement` owns one slice,
`delivery-loop` owns the lifecycle and claim state, `domain-modeling` owns
vocabulary. This skill **decomposes** a settled outcome into one-fresh-session
vertical slices and, when a tracker is configured, **publishes** them as tickets
with blocking edges for `delivery-loop` to claim.

1. **Pin the settled outcome and its decisions.** Read the spec, the resolved
   decisions, and the explicit non-goals. If any decision that gates
   implementation is still fog, stop and route to `$domain-modeling` —
   slicing unresolved fog produces false granularity.

   <slice-input>
   Outcome and acceptance:
   Resolved decisions carried:
   Explicit non-goals:
   Public seams the outcome touches:
   </slice-input>

   **Done when:** every gating decision is settled, or an unresolved one is named
   and handed off before any slice is emitted.

2. **Cut the tracer bullet first.** Find the thinnest slice that makes the
   outcome observable end to end — real caller through the public seam to a
   result, touching every layer the outcome needs, including one falsifier. This
   is slice 1; the feature is demonstrable after it.

   **Done when:** slice 1 alone produces a real, testable result along the full
   vertical path, not a skeleton or a layer.

3. **Add one slice per independent capability.** Each later slice extends the
   vertical path by one independent capability — one more check, route, or output
   shape — each carried CLI to logic to output to test.

   **Done when:** every remaining capability is its own vertical slice and none
   is a layer such as "all tests", "all CLI", or "the module".

4. **State blocking dependencies only where real.** Mark slice N dependent on
   slice M only when N literally cannot run without M's state. Independent
   capabilities stay parallel; the consumer sequences them under WIP of one.

   **Done when:** the dependency graph has no invented edges and every edge is
   load-bearing.

5. **Attach decision evidence per slice.** For each slice state the one outcome
   it advances, the public seam it changes, the fastest signal that can disagree,
   and the spec decision it carries — so a fresh `$implement` session needs no
   other context.

   <slice>
   Slice id and one-line outcome:
   Caller -> public seam -> result:
   Fastest signal that can disagree:
   Decision evidence carried from the spec:
   Blocks / blocked by:
   </slice>

   **Done when:** each slice is self-contained for a fresh session and names its
   falsifier.

6. **Reject horizontal layers.** Drop any candidate that is a layer rather than a
   path: a skeleton, all tests, all CLI, or all docs. Each group must be a
   vertical path. The one exception is a **wide refactor** — one mechanical change
   whose blast radius breaks the whole codebase at once; sequence it as
   expand–contract per [tickets.md](references/tickets.md), not a tracer bullet.

   **Done when:** no slice is a layer, and deleting any single slice leaves the
   others coherent and demonstrable.

7. **Emit the list, publish, and hand off.** Output the slice list with the
   dependency graph and a "demonstrable after slice K" marker. When a tracker is
   configured, publish each slice as one ticket with its blocking edges per
   [tickets.md](references/tickets.md) — this **creates** the items; it does not
   claim or sequence them. Hand each slice to `$implement` in a fresh context;
   `$delivery-loop` claims the frontier and owns lifecycle. With no tracker, the
   slice list itself is the artifact.

   <slice-result>
   Outcome pinned:
   Slice list with ids:
   Dependency graph:
   Demonstrable after slice:
   Published tickets (if a tracker is configured):
   Routed to: $implement (one per fresh session) via $delivery-loop
   </slice-result>

   **Done when:** every slice is one-fresh-session-sized, end-to-end vertical,
   has explicit dependencies, carries its own decision evidence, none is a
   horizontal layer, and each is published as a ticket when a tracker is
   configured without claiming or sequencing any.
