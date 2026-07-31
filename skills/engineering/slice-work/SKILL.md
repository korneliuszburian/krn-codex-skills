---
name: slice-work
description: Turn a settled multi-change spec into implementation-ready vertical slices or expand-contract migration stages with explicit dependencies and truthful ticket-publication state. Use before implementation; skip unresolved fog, single changes, and execution.
---

# Slice Work

Produce the work-unit list; never execute it. `$implement` owns one unit,
`$delivery-loop` owns claim and lifecycle state, and the matching typed owner
owns any unsettled decision. This skill owns two decomposition shapes: end-to-end
**vertical slices** and explicit **expand–migrate–contract stages**.

1. **Pin a settled multi-change outcome.** Read the spec, resolved decisions,
   acceptance, and non-goals. If a gating decision is still fog, stop and route
   it to the smallest typed owner in the global routing contract. If the whole
   destination fits one fresh
   `$implement` context as one end-to-end change, route it there without
   manufacturing a slice list.

   <slice-input>
   Outcome and acceptance:
   Spec identity and resolved decisions:
   Explicit non-goals:
   Public seams touched:
   Why more than one fresh implementation context is required:
   </slice-input>

   **Done when:** the outcome is settled and genuinely needs multiple work
   units, or it has been returned intact to the single-change owner.

2. **Choose one decomposition shape.** Use vertical slices when capabilities
   can become observable independently. Use expand–migrate–contract only when
   an existing compatibility boundary or wide mechanical blast radius makes a
   direct vertical change unsafe or impossible to keep green. Read
   [tickets.md](references/tickets.md) for the migration-stage invariants and
   ticket publication branch.

   **Done when:** one shape is selected for a concrete reason; a vague large
   diff is not enough to choose migration stages.

3. **Cut the selected work units.** For vertical work, start with the thinnest
   tracer bullet from a real caller through the highest public seam to an
   observable result and one falsifier. Add one later slice per independent
   capability, each preserving that end-to-end path.

   For a migration, emit the full ordered contract: an **expand** stage that
   safely supports old and new forms, one or more bounded **migrate** stages
   that move callers or data while compatibility remains, and a **contract**
   stage that proves no old consumer remains before removing the old form.
   Every stage states its entry invariant, exit invariant, falsifier, and
   rollback or compatibility boundary.

   **Done when:** every vertical slice yields observable behavior, or every
   migration stage leaves the system in its stated safe intermediate state.

4. **Add only load-bearing dependencies.** A work unit blocks another only when
   the latter cannot run safely without the former's state. Independent vertical
   capabilities remain independent. Migration stages preserve expand before
   migrate and all required migrations before contract; do not add chronology
   that has no safety or execution dependency.

   **Done when:** every edge names the state it depends on and removing the edge
   would make the downstream unit unsafe or impossible.

5. **Carry decision evidence into each fresh context.** Give each unit one
   outcome, public seam or migration invariant, fastest disagreeing signal,
   exact spec decision, and dependency evidence.

   <work-unit>
   Id and one-line outcome:
   Kind: vertical-slice | migration-stage
   Stage, if migration: expand | migrate | contract
   Caller -> public seam -> result, or entry -> exit invariant:
   Fastest signal that can disagree:
   Decision evidence carried from the spec:
   Blocks / blocked by and why:
   </work-unit>

   **Done when:** every unit is one-fresh-session-sized and executable without
   rediscovering its decision or guessing its completion proof.

6. **Reject the wrong shape.** A vertical list contains no horizontal unit such
   as all tests, all CLI, all docs, or one module. A migration list contains no
   stage lacking a compatibility reason and no contract stage that can run
   before old consumers are disproven. Re-cut any unit whose output cannot be
   demonstrated or whose intermediate state is undefined.

   **Done when:** each unit earns its selected shape and the full list covers
   acceptance without speculative work.

7. **Separate list completion from ticket publication.** Deliver the complete
   list and dependency graph to the active outcome owner first. If later contexts
   need it before the outcome finishes, `$slice-work` owns the exact transient
   list under `.krn/runs/slice-work/<run-id>/` only with write authority and after
   verifying `.krn/runs/` is ignored; otherwise it stays in the active Goal or
   thread. Name the active outcome owner as its sole in-goal consumer. `$slice-work` removes
   its run only when that consumer finishes the accepted outcome or the owning
   Goal closes, whichever comes first; reading the list or completing one unit is
   not cleanup.

   When `$delivery-loop` owns an active outcome capsule, `$slice-work` returns
   the list identity and pointer to its named sole writer; it never mutates or
   creates the capsule. That writer records the identity, pointer, and scoped
   `Ticket publication state` under `Evidence observed`, any `PUBLISH_PENDING`
   condition under `Open unknowns and blockers with owners`, and the next
   implementation unit and owner under `Next bounded owner and action`. When a
   transient run exists, it also records `$slice-work`, the semantic pointer,
   named sole in-goal consumer, trigger, and current state under `Outstanding
   workflow-run cleanup`, upserting the entry by pointer without replacing
   sibling obligations; `$slice-work` remains the cleanup owner. Otherwise
   continuation stays in the native Goal or configured tracker. Creating tracker
   tickets requires an existing tracker identity and operations declared by the
   closest repository `AGENTS.md` or other closest instructions, plus publication
   authority. Those instructions describe how; they do not authorize the
   mutation. When authorized, publish one ticket per unit and read back its
   identity and blocking edges per [tickets.md](references/tickets.md). This
   skill creates tickets but never claims or sequences them.

   Use one truthful **ticket-publication state**. This is scoped to tracker
   artifacts and never replaces the outcome capsule's lifecycle-level
   `Publication state`:

   - `NOT_REQUESTED` — the active outcome owner accepted the list without
     requesting durable publication;
   - `PUBLISH_PENDING` — publication was requested but the destination or
     authority is missing;
   - `PUBLISHED` — the tickets and blocking edges were read back.

   Never invent a tracker or fallback path.

   <slice-result>
   Outcome pinned:
   Shape: vertical slices | expand-migrate-contract
   Work-unit list and dependency graph:
   Demonstrable result or migration end state:
   Ticket publication state: NOT_REQUESTED | PUBLISH_PENDING (<missing condition>) | PUBLISHED (<ticket identities>)
   Transient list: absent | <semantic pointer>
   Sole in-goal consumer: <active outcome owner>
   Cleanup owner and trigger: none | $slice-work when <named sole consumer finishes its accepted outcome | owning Goal closes>, whichever comes first
   Routed to: $implement (one unit per fresh context) via $delivery-loop when lifecycle orchestration is requested
   </slice-result>

   **Done when:** the multi-unit plan is implementation-ready, publication truth
   is explicit, and no ticket has been claimed or production work begun.
