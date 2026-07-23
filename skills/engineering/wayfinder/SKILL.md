---
name: wayfinder
description: Chart a multi-session effort as a shared map of decision tickets on the configured tracker and resolve them one at a time until the way to the destination is clear. Use when an idea is too big and foggy for one session; skip settled specs, slicing, and execution.
---

# Wayfinder

A loose idea has arrived — too big for one session, wrapped in fog: the way from
here to the **destination** is not visible yet. Wayfinding finds that way; it does
not charge at the destination. This skill charts a **map** of **decision tickets**
on the repo's tracker, then resolves them one at a time until the route is clear.

**Plan, don't do.** Each ticket resolves a *decision*, not a slice of build. The
map is done when nothing remains to decide before someone does the thing. The pull
to just do the work is usually the signal you have reached the edge of the map and
must hand off. An effort may carry execution into the map via its **Notes**; absent
that, produce decisions, not deliverables. `$slice-work` owns decomposition of a
settled spec, `$to-spec` owns spec compression, `$implement` owns the build, and
`$delivery-loop` owns lifecycle — wayfinder only clears fog upstream of them.

1. **Name the destination.** The destination fixes scope, so settle it first. Run
   `$domain-modeling` to pin what this map is finding its way to — a spec, a
   decision, or an in-place change. One or two lines; every later session orients
   to it before choosing a ticket.

   **Done when:** the destination is a single named outcome and the scope it fixes
   is stated, or the idea is small enough that no map is needed (stop and tell the
   user).

2. **Map the frontier breadth-first.** Grill across the whole space, not deep on
   one thread, surfacing open decisions and the first steps takeable now. Sketch
   what you can tell is coming but cannot yet sharpen into **Not yet specified**
   (fog). **If this surfaces no fog, the way is already clear — do not make a map.**
   Stop and ask the user how to proceed.

   **Done when:** the destination, the sharp tickets, and the remaining fog are
   distinguished; see [map-template.md](references/map-template.md) for the Fog or
   ticket test.

3. **Create the map.** Publish one map artifact (the tracker issue or local file
   labelled `wayfinder:map`) from [map-template.md](references/map-template.md):
   Destination and Notes filled, Decisions-so-far empty, fog in Not yet specified,
   ruled-out work in Out of scope. The map is an **index, not a store** — it gists
   each decision and links it; a decision lives in exactly one place, its ticket.

   Express map, child tickets, blocking, and claim through the operations in
   `docs/agents/issue-tracker.md`. If that doc lacks wayfinding operations, fall
   back to local-markdown (`.scratch/<effort>/map.md` plus one file per ticket) and
   state the assumption; do not run `$setup-repository-workflow` unprompted.

   **Done when:** the map exists in the configured place with all five sections and
   refers to every ticket by its name, never a bare id.

4. **Create the tickets you can sharpen now** as children of the map, one Question
   each, labelled `wayfinder:<type>` — `research`, `prototype`, `grilling`, or
   `task` (see [map-template.md](references/map-template.md)). Wire blocking edges
   in a **second pass** (tickets need ids before they can reference each other) using
   the tracker's native dependency relationship. The **frontier** is the open,
   unblocked, unclaimed children — the edge of the known. Everything still foggy
   stays in Not yet specified; do not pre-slice it.

   **Done when:** every sharp question is a ticket with a type and real blocking
   edges, and no fog has been forced into a ticket.

5. **Work one ticket per session** (research excepted). Load the map at low
   resolution, choose a frontier ticket (the user may name one), and **claim it
   through the tracker before any work** so concurrent sessions skip it. Resolve it
   by invoking the skill its type names — `$second-opinion-review` for research,
   `$domain-modeling` for grilling (the default), a throwaway prototype for
   prototype, or the manual work for task. Zoom related or closed tickets on demand.

   **Done when:** one ticket is claimed, resolved with the named skill, and its
   answer recorded as a resolution on the ticket.

6. **Record, graduate, and re-scope.** Post the answer on the ticket, **close** it,
   and append a one-line gist plus link to the map's Decisions-so-far. Graduate any
   fog the answer made specifiable into fresh tickets (create-then-wire), clearing
   each patch from Not yet specified. If a ticket — this one or another — turns out
   to sit past the destination, **close it and leave one line in Out of scope**
   rather than walking it on the route. If a decision invalidates other tickets,
   update or delete them.

   **Done when:** the map's index, fog, and scope reflect the new decision, and no
   stale ticket remains on the frontier.

7. **Hand off when the way is clear.** When no tickets remain and no fog is left,
   the route is found.

   <wayfinder-result>
   Destination:
   Map (tracker location):
   Decisions recorded:
   Remaining fog:
   Routed to: $to-spec (spec needed) | $slice-work (multi-slice) | $implement (single change) via $delivery-loop
   </wayfinder-result>

   **Done when:** the next owner is named from the cleared route, or the map still
   holds open tickets and the session stops after one.
