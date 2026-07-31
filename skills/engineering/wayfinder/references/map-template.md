# Wayfinder Map And Ticket Contracts

The tracker identity and operations declared by the closest repository
`AGENTS.md` managed block or other closest repository instructions are a hard
dependency. Use exactly their operations for map creation and update, child
tickets, dependency edges, claim, resolution, close, frontier query, and
integrator transfer/readback. The map must name one worker-result return channel.
If any operation or channel is not defined, stop and name it. Do not substitute
a conversation plan, undeclared repository document, invented `.scratch/` tree,
or an invented body convention.

The map is an **index**, not a store: it gists each resolution and links the
ticket that holds the complete answer. Refer to maps and tickets by linked title in
human-facing text; a bare tracker id is not enough context.

## Map Body

Load this once per session at low resolution. Query open children from the
tracker instead of duplicating them here.

<map-template>
## Destination

The one- or two-line end state this effort is finding its way to. It fixes the
scope of every ticket.

## Notes

Standing constraints and exact workflow references shared by the frontier
tickets. Notes never authorize production work or another external mutation.

## Map integrator

Sole tracker writer: `<actor or session identity>`

Worker-result return channel: `<exact channel or operation>`

Tracker-write authority: `AUTHORIZED (<non-secret scope>)` or
`PENDING (<missing condition>)`

Writer state: `ACTIVE (<writer generation>)` or
`TRANSFER_PENDING (<next generation; successor identity and channel>)`

Activation readback: `PENDING (<writer generation>)` or
`VERIFIED (<same writer generation>; <tracker observation>)`

## Resolutions so far

One linked gist per closed frontier ticket, enough to decide whether to open it.
The ticket remains the primary source for its complete answer, evidence, owner,
and authority.

- Closed ticket title — `<tracker identity>` — one-line resolution

## Not yet specified

In-scope fog whose objective cannot yet be phrased precisely because it depends
on an open frontier item. It excludes resolutions, live tickets, and
out-of-scope work.

## Out of scope

Work beyond the destination. It never graduates unless the user redraws the
destination as a new effort.

## Terminal route

`OPEN` while tickets or fog remain. When the way is clear, record `ROUTED`, the
optional lifecycle envelope (`NONE` or `$delivery-loop`), exact next procedure
owner (`$to-spec`, `$implement`, `$slice-work`, or the user), and handoff
identity. Then close and read back the map through the configured tracker. An
empty frontier without this terminal record is not a closed outcome.
</map-template>

## Ticket Body

Each ticket is a durable child of the map and contains one decision question or
prerequisite action sized to one fresh worker context.

<ticket-template>
## Objective

The decision this ticket resolves, or the concrete prerequisite and the decision
it unblocks.

## Exact owner, authority, and expected evidence

One owner or configured operation. For a task, state separate mutation authority
and the observable result or readback required for closure.

## Execution envelope

Use `NOT_APPLICABLE (<why this work cannot observe or depend on repository or
filesystem state>)`, or record all of:

- canonical repository realpath and `cwd`;
- immutable ref or exact input working-tree fingerprint;
- allowed paths and separate mutation authority;
- result shape and pointer to the canonical **Result return** block below;
- named consumer;
- what the result does not prove.

Read this block back before delegation. A tracker identity, claim, or child type
does not grant repository writes or widen the recorded paths. Every write-capable
child requires an isolated worktree and one named integration owner, even when
serial. Concurrent file writers additionally require disjoint allowed paths;
otherwise their mutation authority is `NONE`.

## Result return

This is the child's sole mutable return destination. Integrator transfer updates
and reads back this block; the execution envelope only points here.

Map integrator: `<active identity copied from the parent>`

Worker-result return channel: `<exact channel or operation>`

Writer generation: `<active generation copied from the parent>`

Worker tracker mutation authority: `NONE`

## Resolution

Open until the exact owner returns its verdict or completion evidence.
</ticket-template>

Claim through the configured tracker before work. The frontier is every open,
unblocked, unclaimed child returned by its documented query. One worker context
owns one ticket. Independent tickets may run concurrently only after separate
claims and under the surrounding writer policy. Workers treat the parent and
child identities as read-only context and return complete results; one map
integrator alone writes and closes children, updates the parent and frontier,
and incorporates returned evidence. Use the tracker's configured dependency
operation; if it cannot express blocking, the Wayfinder hard dependency is
unmet.

Integrator transfer is fail-closed. With no claimed or in-flight child, the
current integrator or a separately authorized tracker administrator creates a
fresh writer generation, records `TRANSFER_PENDING`, the successor identity and
return channel, updates every open child's result-return block, and reads the
pending parent and children back. It then records `ACTIVE` with activation
readback `PENDING`, reads the active parent and children, records `VERIFIED` for
the same generation and observation, and reads the parent again. Admission
requires a fresh readback of `AUTHORIZED`, `ACTIVE`, matching `VERIFIED`
generation, and matching open children. No frontier mutation occurs during the
transfer. Any incomplete or mismatched phase remains a blocker; no session
self-designates.

## Ticket Types And Owners

- **`wayfinder:research`** (AFK) — name one exact owner.
  `$source-to-decision` decides whether an external mechanism is `adopt`,
  `reject`, `lab-test`, or `defer` for the named consumer. `$codebase-design`
  owns local module, seam, dependency, or behavior-ownership evidence. A generic
  fact lookup alone does not earn a ticket.
- **`wayfinder:prototype`** (HITL) — `$prototype` produces one experiential
  verdict, returns it to the map integrator, then cleans up its ephemeral code.
- **`wayfinder:grilling`** (HITL) — `$domain-modeling` resolves a user-owned
  choice or contested shared meaning. Use it when the user owns the choice or
  shared meaning, rather than a source, runnable experiment, or code-friction
  observation.
- **`wayfinder:task`** — a named human, configured operation, or existing
  workflow completes one concrete prerequisite whose observed result unblocks an
  in-map decision. Record its exact action, separate authority, expected
  evidence, and readback.

A HITL ticket resolves only through the live exchange; the agent never invents
the human answer. Wayfinder may claim and track a task, but never grants its
authority or executes the named owner's procedure. If the action can wait until
the route is settled, it is downstream work rather than a task ticket.

## Fog Of War

Use a ticket when its objective can be stated precisely now, even if blocked.
Use **Not yet specified** when an earlier answer is required before the decision
or necessary prerequisite itself can be stated precisely. Resolving a ticket may
graduate one fog item into several tickets or none; never pre-slice it.

## Out Of Scope

When an existing ticket is revealed to sit past the destination, close it so it
leaves the frontier and add one linked line under **Out of scope** with the
reason. Do not list it under **Resolutions so far** because a scope boundary is
not a resolution on the route actually walked.
