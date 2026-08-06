---
name: wayfinder
description: Plan a huge chunk of work - more than one agent session can hold - as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
---

# Wayfinder
A loose idea has arrived — too big for one agent session, wrapped in fog:
the way from here to the **destination** isn't visible yet. Wayfinding
charts the way as a **shared map** on the repo's issue tracker, then works
its **decision tickets** — questions whose resolution is a decision, not
slices of a build to execute — one at a time until the route is clear.
Naming the destination is the first act of charting: a spec to hand off
and iterate on, a decision to lock before planning starts, or a change
made in place like a data-structure migration. Domain-agnostic — engineering
work, course content, whatever fits.

## Plan, don't do
Each ticket resolves a decision; the map is done when the way is clear —
nothing left to decide before someone goes and does the thing. The pull to
just do the work is the signal you've reached the edge of the map. An
effort can override this in its **Notes** — carrying execution into the map
itself — but absent that, produce decisions, not deliverables.

## Refer by name
Every map and ticket is an issue, so it has a **name** — its title. In
everything the human reads — narration, the map's Decisions-so-far — refer
to it by that name, never by a bare id, number, or slug: a wall of
`#42, #43, #44` is illegible; the id rides _inside_ the name, never in its
place.

## The Map
One issue on the repo's tracker, labelled `wayfinder:map` — the canonical
artifact; its tickets are child issues. The map is an **index**, not a
store: a decision lives in exactly one place — its ticket — so the map
only gists it and links.
**Where map, tickets, blocking, and frontier queries live is
tracker-specific.** Default: local markdown — the map at
`.scratch/wayfinder-map.md`, tickets under `.scratch/wayfinder/<name>.md`.
With a real tracker configured, use its native issues, labels, and
blocking. Templates: [map-template.md](references/map-template.md).
The map body is the whole map at low resolution, loaded once per session;
open tickets are **not** listed — they are open child issues, found by
query.

### Tickets
Each ticket is a **child issue** of the map; the tracker's issue id is its
identity. Its body is the question, sized to one 100K-token agent session.
It carries a `wayfinder:<type>` label — `research`, `prototype`,
`decision-review`, or `task` (below). A session **claims** a ticket by
assigning it to the dev driving the map, **first**, before any work, so
concurrent sessions skip it — that assignee _is_ the claim.

Blocking uses the tracker's **native** dependency relationship — essential
because it renders the frontier _visually_ in the tracker's UI. Only a
tracker lacking native blocking falls back to a body convention. A ticket
is **unblocked** when every ticket blocking it is closed; the **frontier**
is the open, unblocked, unclaimed children — the edge of the known. The
answer is never part of the body — it's recorded on resolution; assets
created while resolving are linked from the issue, not pasted in.

## Ticket Types

Every ticket is **HITL** — human in the loop, worked _with_ a human — or
**AFK**, driven by the agent alone. A HITL ticket only resolves through
that live exchange; an agent answering its own interview questions has
broken this.

- **Research** (AFK): reading docs, third-party APIs, or local knowledge
  bases to surface a fact a decision waits on. Resolved by a **research
  subagent**. Use when knowledge outside the current working directory is
  required.
- **Prototype** (HITL): raise the fidelity of the discussion with a cheap,
  rough, concrete artifact to react to — an outline, a rough take, a stub,
  or UI/logic code. Link the prototype as an asset. Use when "how should it
  look" or "how should it behave" is the key question.
- **Decision-review** (HITL): a conversation with the user, one question at
  a time, to pin down what they want — never inventing their side. The
  default case.
- **Task** (HITL or AFK): manual work that must happen before a _decision_
  can be made — nothing to decide, prototype, or research, but the
  discussion is blocked until it's done (signing up for a service so its
  API can be judged, provisioning access, moving data so its shape can be
  seen). The one type that _does_ rather than decides; it earns its place
  by unblocking a decision, not by delivering the destination. The agent
  drives it alone where it can; otherwise it hands the human a precise
  checklist. The answer records what was done and any resulting facts
  (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: beyond the live tickets lies the dim
view of decisions you can tell are coming but can't yet pin down, because
they hang on questions still open. The map's **Not yet specified** section
holds that view; resolving a ticket graduates whatever's now specifiable
into fresh tickets. **Fog or ticket?** The test is whether you can state
the question precisely now — not whether you can answer it. Not-yet-
specified excludes what's already decided, what's already a live ticket,
and what's out of scope. Mechanics: [fog-and-scope.md](references/fog-and-scope.md).

## Out of scope

Fog only gathers _toward_ the destination; work beyond it is **out of
scope** — it isn't fog and doesn't belong in Not-yet-specified (scope, not
sharpness, lands it here). It never graduates — the frontier stops at the
destination — so it returns only if the destination is redrawn. A ticket
that sits past the destination is **closed**, with one line in the **Out of
scope** section: the gist plus why, linking the closed ticket; it stays out
of **Decisions so far**. Mechanics: [fog-and-scope.md](references/fog-and-scope.md).

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** —
with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Interview the user directly, one question at a
   time. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Interview again, **breadth-first**: fan out across
   the whole space, surfacing open decisions and the first steps takeable
   now. **If this surfaces no fog** — the way is already clear and small
   enough for one session — no map: stop and ask how to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes
   filled, Decisions-so-far empty, the fog sketched into Not-yet-specified.
4. **Create the tickets you can specify now** as child issues — then wire
   blocking edges in a **second pass** (issues need ids before referencing
   each other): frontier and blocked; the rest stays in the fog.
5. **Fire the research subagents** — one per `research` ticket, in
   parallel, findings on a throwaway `research/<name>` branch with a
   context pointer from the ticket.
6. Stop — charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional** — without
one, you pick the next decision.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket: the user's, or the first frontier ticket in order.
   **Claim it BEFORE any work** — in a mini-agi repo use the KERNEL's
   ticket tools (`mini-agi ticket claim <ticket>` — lease + lock;
   `ticket release`; `ticket validate-graph` is CLI-only, the MCP surface
   has claim/release/claims): the kernel owns claims and locks and reads
   `tickets/TICKET-<n>.md` (the `.scratch/` form is for non-mini-agi
   trackers); on an external tracker assign via the tracker. Never
   re-implement claims in prose where the kernel tool exists.
3. Resolve it — **zoom as needed**: fetch the full body of any related or
   closed ticket on demand; invoke the skills the **Notes** block names.
   If in doubt, ask the user a direct question.
4. Record the resolution: post the answer as a **resolution comment**,
   **close** the issue, and **append a context pointer** to the map's
   Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate fog the answer
   made specifiable, clearing each patch from Not-yet-specified. A ticket
   beyond the destination is **ruled out of scope**, not resolved on the
   route. If the decision invalidates other parts of the map, update or
   delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to
be editing the tracker concurrently.

## Completion criteria

- [ ] The destination is named (one or two lines) and user-approved before
      any ticket exists.
- [ ] The map lists only names, never bare ids, in narration.
- [ ] Open tickets are found by query, not enumerated in the map body.
- [ ] Every ticket has a `wayfinder:<type>` label and a Question body sized
      to one session.
- [ ] Claim-before-work: a session never resolves a ticket it did not
      assign to itself first.
- [ ] No HITL ticket was resolved without the human's side of the exchange.
- [ ] Decisions-so-far, Not-yet-specified, and Out-of-scope are kept
      distinct; out-of-scope work never graduates.
- [ ] At most one non-research ticket resolved per session.
- [ ] Research ticket results were recorded with a context pointer, not
      pasted into the map.
