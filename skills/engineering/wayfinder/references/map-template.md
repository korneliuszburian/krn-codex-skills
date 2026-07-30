# Wayfinder Map And Ticket Contracts

The tracker identity and operations declared by the closest repository
`AGENTS.md` managed block or other closest repository instructions are a hard
dependency. Use exactly their operations for map creation and update, child
tickets, dependency edges, claim, resolution, close, and frontier query. If any
operation is not defined, stop and name it. Do not substitute a conversation
plan, undeclared repository document, invented `.scratch/` tree, or an invented
body convention.

The map is an **index**, not a store: it gists each decision and links the ticket
that holds the complete answer. Refer to maps and tickets by linked title in
human-facing text; a bare tracker id is not enough context.

## Map Body

Load this once per session at low resolution. Query open children from the
tracker instead of duplicating them here.

<map-template>
## Destination

The one- or two-line end state this effort is finding its way to. It fixes the
scope of every ticket.

## Notes

Standing constraints and exact workflow references shared by the decision
tickets. Notes never authorize production work or another external mutation.

## Decisions so far

One linked gist per closed decision ticket, enough to decide whether to open it.

- Closed ticket title — `<tracker identity>` — one-line answer

## Not yet specified

In-scope fog whose question cannot yet be phrased precisely because it depends
on an open decision. It excludes decisions, live tickets, and out-of-scope work.

## Out of scope

Work beyond the destination. It never graduates unless the user redraws the
destination as a new effort.
</map-template>

## Ticket Body

Each ticket is a durable child of the map and contains one question sized to one
session.

<ticket-template>
## Question

The decision this ticket resolves.

## Resolution

Open until the exact owner returns its verdict and evidence.
</ticket-template>

Claim through the configured tracker before work. The frontier is every open,
unblocked, unclaimed child returned by its documented query. Use the tracker's
configured dependency operation; if it cannot express blocking, the Wayfinder
hard dependency is unmet.

## Ticket Types And Owners

- **`wayfinder:research`** (AFK) — `$source-to-decision` decides whether an
  external mechanism is `adopt`, `reject`, `lab-test`, or `defer` for the named
  consumer. A fact lookup alone does not earn this workflow.
- **`wayfinder:prototype`** (HITL) — `$prototype` produces one experiential
  verdict, promotes it into this ticket, then cleans up its ephemeral code.
- **`wayfinder:grilling`** (HITL) — `$domain-modeling` resolves a user-owned or
  contested decision. This is the default when evidence or experience cannot
  own the answer.

A HITL ticket resolves only through the live exchange; the agent never invents
the human answer. A prerequisite requiring production work, provisioning,
publication, or another external mutation remains an external blocker with a
named owner and requested action. It is not a Wayfinder decision ticket.

## Fog Of War

Use a ticket when its question can be stated precisely now, even if blocked.
Use **Not yet specified** when an earlier answer is required before the question
itself can be stated precisely. Resolving a ticket may graduate one fog item
into several tickets or none; never pre-slice it.

## Out Of Scope

When an existing ticket is revealed to sit past the destination, close it so it
leaves the frontier and add one linked line under **Out of scope** with the
reason. Do not list it under **Decisions so far** because a scope boundary is not
a decision on the route actually walked.
