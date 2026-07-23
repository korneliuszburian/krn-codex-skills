# Wayfinder map and ticket templates

The map is an **index**, not a store: it gists each decision and links the ticket
that holds it. A decision lives in exactly one place — its ticket. Refer to every
map and ticket by its **name** (title) in anything the human reads; a bare id is
illegible. The id and link do not vanish — a name wraps its link — but they ride
inside the name.

Express the map, child tickets, blocking edges, and claim through the operations in
`docs/agents/issue-tracker.md`. If that doc lacks wayfinding operations, fall back
to local-markdown: `.scratch/<effort>/map.md` for the map and one file per ticket
under `.scratch/<effort>/tickets/`.

## Map body

Loaded once per session at low resolution. Open tickets are **not** listed here —
they are open children, found by a frontier query.

<map-template>
## Destination

What reaching the end of this map looks like — the spec, decision, or change this
effort is finding its way to. One or two lines; every session orients to it before
choosing a ticket.

## Notes

Domain; skills every session should consult; standing preferences for this effort.
An effort may carry execution into the map here, overriding plan-don't-do.

## Decisions so far

The index — one line per closed ticket: enough to judge relevance, then zoom the
link for the detail the ticket holds.

- `#NN` closed ticket title (tracker URL) — one-line gist of the answer

## Not yet specified

In-scope fog you cannot ticket yet (see Fog of war). It graduates as the frontier
advances. Excludes decisions already made, live tickets, and out-of-scope work.

## Out of scope

Work ruled beyond the destination (see Out of scope). It never graduates.
</map-template>

## Ticket body

Each ticket is a child of the map; its identity is its tracker id. Its body is the
question, sized to one session.

<ticket-template>
## Question

The decision or investigation this ticket resolves.
</ticket-template>

Each ticket carries a `wayfinder:<type>` label. A session **claims** it through the
tracker's claim operation (assign / `bd` claim) before any work; the claim is the
assignee — an open, unassigned ticket is unclaimed. Blocking uses the tracker's
**native** dependency relationship so the frontier renders visually in the tracker
UI; only a tracker without native blocking falls back to a body convention. A
ticket is **unblocked** when every ticket blocking it is closed.

## Ticket types

Every ticket is **HITL** (worked with a human who speaks for themselves) or **AFK**
(agent alone). A HITL ticket resolves only through that live exchange; the agent
never stands in for the human's side of it.

- **research** (AFK) — surface a fact a decision waits on by reading docs, third-party
  APIs, or local resources. Resolve with a `$second-opinion-review` research campaign;
  link its findings from the ticket, never paste them in.
- **prototype** (HITL) — raise fidelity with a cheap, rough artifact to react to — an
  outline, a stub, or logic/UI code from a throwaway prototype. Use when "how should it
  look" or "how should it behave" is the key question.
- **grilling** (HITL) — one question at a time via `$domain-modeling`. The default
  type.
- **task** (HITL or AFK) — manual work that must happen before a *decision* can be
  made (sign up for a service, provision access, move data to reveal its shape).
  Nothing to decide, prototype, or research, but the discussion is blocked until it
  is done. This is the one type that *does* rather than decides; it earns its place by
  unblocking a decision, not by delivering the destination. Resolved when the work is
  done; the answer records what was done and any facts later tickets depend on.

## Fog of war

The map is deliberately incomplete: do not chart what you cannot yet see. Beyond the
live tickets lies the **fog of war** — decisions you can tell are coming but cannot
pin down, because they hang on questions still open. Resolving a ticket clears the
fog ahead of it, graduating what is now specifiable into fresh tickets, one at a
time, until the way is clear.

**Fog or ticket?** The test is whether you can state the question *precisely* now —
not whether you can answer it now.

- **Ticket** when the question is already sharp — even if it is blocked.
- **Not yet specified** when you cannot yet phrase it that sharply. Do not pre-slice
  fog into ticket-sized pieces: one patch may graduate into several tickets, or none.

## Out of scope

Fog gathers only toward the destination. The destination fixes scope, so work beyond
it is **out of scope** — it is not fog and does not belong in Not yet specified. It
never graduates; the frontier stops at the destination, so out-of-scope work returns
only if the destination is redrawn, and then as a fresh effort.

When a ticket that already exists turns out to sit past the destination, **close it**
(a closed ticket is unambiguously off the frontier) and leave one line in Out of
scope: the gist plus why, linking the closed ticket. It stays out of Decisions so
far — a scope boundary is not a step on the route actually walked.
