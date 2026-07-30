---
name: wayfinder
description: Chart a foggy multi-session effort as a durable tracker map of decision tickets and resolve them one at a time until the route is clear. Invoke explicitly when an idea is too big and uncertain for one session; skip settled specs, slicing, and execution.
---

# Wayfinder

Wayfinding clears decision fog before execution. It creates one durable map and
sharp decision tickets, resolves one frontier ticket per session, and stops
when the route to the destination is settled. `$to-spec`, `$slice-work`,
`$implement`, and `$delivery-loop` own everything downstream.

1. **Bind the durable tracker and destination.** Read the tracker identity and
   operations declared by the closest repository `AGENTS.md` managed block or
   other closest repository instructions. This is a hard dependency: the
   instructions must name an existing durable tracker and exact operations for
   creating and updating a map, child tickets, blocking edges, claims,
   resolutions, and frontier queries. If any operation is absent, stop with that
   setup requirement. Also resolve authority for the required tracker mutations
   before creating anything. An ad hoc conversation plan, undeclared repository
   document, or invented `.scratch/` convention is not a substitute.

   Name the one- or two-line destination that fixes scope. Use
   `$domain-modeling` only when the destination itself is contested. If the
   effort is already clear or fits one session, make no map and return it to the
   appropriate downstream owner.

   **Done when:** a capable durable tracker, required mutation authority, and one
   scoped destination exist, or the workflow has stopped without inventing them.

2. **Map the frontier breadth-first.** Grill across the whole decision space.
   Separate questions sharp enough to ticket now from **Not yet specified** fog
   whose question depends on an earlier answer. Keep work beyond the destination
   in **Out of scope**. Read [map-template.md](references/map-template.md) for
   the exact map, ticket, and fog contracts.

   **Done when:** destination, sharp questions, dependent fog, and out-of-scope
   work are distinct. If no fog or sharp decision remains, do not create a map.

3. **Create one map and its sharp tickets.** Create one tracker item labelled
   `wayfinder:map`, then one child per currently sharp question. Use only these
   ticket types and exact workflow owners:

   - `wayfinder:research` → `$source-to-decision` for an external-evidence
     disposition;
   - `wayfinder:prototype` → `$prototype` for one experiential design verdict;
   - `wayfinder:grilling` → `$domain-modeling` for a user-owned or contested
     decision.

   Create tickets first, then wire their documented blocking relationships in
   a second pass. Production work, provisioning, publication, and other
   mutations are blockers owned outside this map, never a fourth ticket type or
   an execution escape hatch.

   **Done when:** every sharp question has one typed child and exact owner,
   every load-bearing dependency exists in the tracker, and fog has not been
   forced into a ticket.

4. **Resolve one frontier ticket per session.** Load the map at low resolution,
   query open unblocked unclaimed children, choose one, and claim it through the
   configured tracker before invoking its exact owner. The invoked skill owns
   its procedure; Wayfinder supplies the question, destination, relevant prior
   decisions, and the ticket as the verdict destination.

   A research ticket closes only with `$source-to-decision`'s `adopt`, `reject`,
   `lab-test`, or `defer`; a prototype ticket closes only after `$prototype`
   promotes its verdict to the ticket and disposes of the prototype; a grilling
   ticket closes only after `$domain-modeling` records the confirmed decision.

   **Done when:** one claimed ticket has one decision, evidence, and named
   unresolved condition, or remains honestly open with a blocker and owner.

5. **Update the map as an index.** Put the full answer on its ticket, close it
   only when resolved, and append one linked gist to **Decisions so far**.
   Graduate newly sharp fog into fresh typed tickets, then wire dependencies.
   Close and index as out of scope any ticket revealed to lie past the
   destination. Update or close tickets invalidated by the new decision so the
   frontier never contains stale work.

   **Done when:** ticket truth, map index, remaining fog, scope, and frontier
   agree after the decision.

6. **Hand off only when the way is clear.** When no open decision tickets or
   fog remain, choose the smallest downstream owner: `$to-spec` when the settled
   route still needs one spec, `$implement` when it is one clear change, or
   `$slice-work` when an existing settled spec needs multiple vertical slices or
   migration stages; use the user when the decisions themselves complete the
   requested outcome. When the accepted outcome includes full lifecycle delivery,
   route to `$delivery-loop` and name that smallest owner as its first composed
   stage. Write the next owner, composed stage when applicable, and exact handoff
   identity into the map's **Terminal route**, close the map through the configured
   tracker, and read back both changes before handing off. If either mutation
   fails, leave the map open with that blocker. Wayfinder never starts execution.

   <wayfinder-result>
   Destination:
   Durable map identity:
   Decisions recorded:
   Remaining open tickets or fog:
   Map state: open | closed and read back
   Routed to: $delivery-loop composing <first-stage> | $to-spec | $implement | $slice-work | user | none-yet
   </wayfinder-result>

   **Done when:** a clear route is durably indexed on a closed map with one next
   owner, or the map remains honestly open and this session stops after its single
   ticket or named closure blocker.
