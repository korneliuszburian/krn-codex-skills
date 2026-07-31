---
name: wayfinder
description: Chart a foggy multi-session effort as a durable tracker map of typed frontier tickets and resolve them in fresh contexts until the route is clear. Invoke explicitly when an idea is too big and uncertain for one session; skip settled specs, slicing, and execution.
---

# Wayfinder

Wayfinding clears decision fog before execution. It creates one durable map and
sharp frontier tickets, resolves one ticket per worker context, and stops
when the route to the destination is settled. `$to-spec`, `$slice-work`,
`$implement`, and `$delivery-loop` own everything downstream.

1. **Bind the durable tracker and destination.** Read the tracker identity and
   operations declared by the closest repository `AGENTS.md` managed block or
   other closest repository instructions. This is a hard dependency: the
   instructions must name an existing durable tracker and exact operations for
   creating and updating a map, child tickets, blocking edges, claims,
   resolutions, frontier queries, and map-integrator identity and transfer
   readback. The map must also carry one exact worker-result return channel. If
   any operation or return channel is absent, stop with that setup requirement.
   Also resolve authority for the required tracker mutations before creating
   anything. An ad hoc conversation plan, undeclared repository document, or
   invented `.scratch/` convention is not a substitute.

   Name the one- or two-line destination that fixes scope. If the destination
   itself is unresolved, use its smallest typed decision owner before creating
   the map. If the effort is already clear or fits one session, make no map and
   return it to the appropriate downstream owner.

   **Done when:** a capable durable tracker, required mutation authority, a
   persistable integrator identity and return channel, and one scoped destination
   exist, or the workflow has stopped without inventing them.

2. **Map the frontier breadth-first.** Survey the whole decision space without
   resolving another owner's question.
   Separate decisions or prerequisites sharp enough to ticket now from **Not yet
   specified** fog whose objective depends on an earlier answer. Keep work beyond
   the destination in **Out of scope**. Read
   [map-template.md](references/map-template.md) for the exact map, ticket, and
   fog contracts.

   **Done when:** destination, sharp frontier objectives, dependent fog, and
   out-of-scope work are distinct. If no fog or sharp objective remains, do not
   create a map.

3. **Create one map and its sharp tickets.** Create one tracker item labelled
   `wayfinder:map`, then one child per currently sharp objective. Use only these
   ticket types. Every child also names one exact owner:

   - `wayfinder:research` → `$source-to-decision` for external evidence, or
     `$codebase-design` for local module, seam, dependency, or behavior-ownership
     evidence;
   - `wayfinder:prototype` → `$prototype` for one experiential design verdict;
   - `wayfinder:grilling` → `$domain-modeling` for a user-owned choice or
     contested shared meaning;
   - `wayfinder:task` → the named human, configured operation, or existing
     workflow that owns one concrete prerequisite whose observed completion is
     needed to unblock an in-map decision.

   Create tickets first, then wire their documented blocking relationships in
   a second pass. A task belongs only when its completion produces evidence
   needed by the decision frontier; work that can wait until the route is clear
   stays downstream. Record the task's action, exact owner, expected evidence,
   and separate authority. Wayfinder tracks its claim and verified result but
   never grants authority or executes the owner's procedure. A task is not an
   escape hatch for speculative production work or publication.

   For any child whose owner can observe repository state or mutate files, also
   persist the execution envelope from [map-template.md](references/map-template.md):
   canonical repository realpath and `cwd`, immutable ref or exact input
   working-tree fingerprint, allowed paths and separate mutation authority,
   result shape and return owner, named consumer, and non-proof. Mark it
   `NOT_APPLICABLE` with a reason only when the delegated work cannot depend on
   repository or filesystem state. A tracker identity never supplies this
   authority.

   In the map's **Map integrator** block, persist the sole tracker-writer
   identity, exact result-return channel, non-secret tracker-authority state,
   writer generation, and matching activation readback. Copy the active
   integrator identity, generation, and return channel into every child. Read the
   initialized parent and children back before marking that generation verified.
   These fields describe observed authority; they never grant it.

   **Done when:** every sharp decision or prerequisite has one typed child,
   exact owner and return contract, and a complete execution envelope when it
   can depend on repository or filesystem state; one active integrator is
   durably identifiable, every load-bearing dependency exists in the tracker,
   and fog has not been forced into a ticket.

4. **Resolve one frontier ticket per worker context.** Load and read back the
   map's **Map integrator** block at low resolution. Query or claim only when its
   identity matches this integrator, separate tracker-write authority is
   currently resolved and the map reports `AUTHORIZED`, writer state is
   `ACTIVE`, activation readback is `VERIFIED` for the same generation, and
   every open child's copied generation and return contract agree. Any mismatch
   blocks the frontier. A different session stops and uses the recorded
   result-return channel; it never self-designates.
   The delegated workflow or actor owns its procedure; Wayfinder supplies the
   objective, destination, relevant prior decisions, the read-only ticket
   identity, the integrator's exact result-return contract, and the ticket's
   read-back execution envelope without widening it. A missing, stale, or
   mismatched envelope blocks path- or state-dependent work before delegation.

   An external research owner returns `$source-to-decision`'s `adopt`, `reject`,
   `lab-test`, or `defer`; a local research owner returns
   `$codebase-design`'s chosen boundary or bounded evidence handoff. A prototype
   owner returns its verdict after disposing of throwaway residue. A grilling
   owner returns `$domain-modeling`'s confirmed decision. A task owner returns
   completion evidence or readback. None closes or mutates the tracker ticket.

   Independent frontier tickets may run concurrently only after distinct claims
   and under the surrounding writer and authority policy. Concurrent workers
   with file-write authority require isolated worktrees, disjoint allowed paths,
   and one named integration owner; otherwise serialize them or keep their
   mutation authority `NONE`. One map integrator serializes every child and
   parent tracker mutation. Each worker context owns one question, treats tracker
   identities as read-only context, and returns its complete evidence to that
   integrator rather than mutating a ticket or map.

   Transfer the integrator only when no child is claimed or in flight. Through
   the configured tracker operation, the current integrator or separately
   authorized tracker administrator creates a fresh generation and writes
   `TRANSFER_PENDING`, the successor identity and return channel, updates every
   open child's copied contract, and reads the pending parent and children back.
   It then writes `ACTIVE` with `Activation readback: PENDING`, reads the active
   parent and children back, records `VERIFIED` for that same generation and
   observation, and reads the parent once more. The successor performs the
   admission readback above before its first frontier operation. Until all checks
   succeed, neither identity may claim or mutate frontier state. If the current
   writer is unavailable and no authorized transfer operation exists, the map is
   blocked rather than implicitly re-owned.

   **Done when:** the map integrator has received one decision or verified
   prerequisite result, evidence, and named unresolved condition from the
   claimed ticket's read-back envelope, or the worker returns an honest blocker
   and owner without mutating tracker state.

5. **Update the map as an index.** Acting as the sole map integrator, put the
   full returned answer on its ticket and close it only when resolved. Append one
   linked gist to **Resolutions so far**. Closed tickets remain the primary
   sources; the map and any later spec only index and synthesize them.
   Graduate newly sharp fog into fresh typed tickets, then wire dependencies.
   Close and index as out of scope any ticket revealed to lie past the
   destination. Update or close tickets invalidated by the new resolution so the
   frontier never contains stale work.

   **Done when:** ticket truth, map index, remaining fog, scope, and frontier
   agree after the decision.

6. **Hand off only when the way is clear.** When no open frontier tickets or
   fog remain, choose the smallest downstream owner: `$to-spec` when the settled
   route still needs one spec, `$implement` when it is one clear change, or
   `$slice-work` when an existing settled spec needs multiple vertical slices or
   migration stages; use the user when the resolved frontier itself completes the
   requested outcome. When the accepted outcome includes full lifecycle delivery,
   attach `$delivery-loop` as the lifecycle envelope without replacing that
   smallest procedure owner. Write the envelope, next owner, and exact handoff
   identity into the map's **Terminal route**, close the map through the
   configured tracker, and read back both changes before handing off. If either
   mutation fails, leave the map open with that blocker. Wayfinder never starts
   execution.

   <wayfinder-result>
   Destination:
   Durable map identity:
   Resolved frontier items:
   Remaining open tickets or fog:
   Map state: open | closed and read back
   Lifecycle envelope: none | $delivery-loop
   Next procedure owner: $to-spec | $implement | $slice-work | user | none-yet
   </wayfinder-result>

   **Done when:** a clear route is durably indexed on a closed map with one next
   owner, or the map remains honestly open and this worker context stops after
   its single ticket or named closure blocker.
