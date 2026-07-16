---
name: batch-grill-me
description: Interview every ready decision in frontier rounds until the user confirms complete shared understanding; skip implementation, specs, tickets, and ordinary fact lookup.
---

# Batch Grill Me

**Work the decision tree by frontier rounds.** A frontier contains every open
decision whose prerequisites are already settled. Facts belong to the agent;
choices belong to the user.

1. **Frame the tree.** Restate the destination, in-scope decision, known
   constraints, and explicit non-goals. Inspect the current environment for
   facts before turning them into questions. Keep the tree as working state;
   do not persist it unless the user separately asks for an artifact.

   **Done when:** the root decision is clear enough to distinguish facts,
   user-owned choices, dependencies, and out-of-scope branches.

2. **Compute the frontier.** Include every user decision that can be answered
   without guessing an unresolved prerequisite. Hold downstream questions for
   a later round. Investigate discoverable facts directly; when delegation is
   authorized and independent, it may run in parallel while only its
   descendant decisions remain blocked.

   **Done when:** every open branch is either on the current frontier, blocked
   by a named fact or decision, or explicitly out of scope.

3. **Ask one complete round.** Number every frontier question. For each one,
   give a recommended answer, the reason it fits the known constraints, and
   the material trade-off. Ask no downstream question in the same round.

   <frontier-round>
   Round:
   Question and user-owned decision:
   Recommended answer:
   Reason and trade-off:
   Unblocks:
   </frontier-round>

   Wait for the user's answers. A recommendation is advice, never a substitute
   for their decision.

   **Done when:** the user has answered, deferred, or rejected every question
   in the round.

4. **Recompute instead of extending the old list.** Apply the answers, resolve
   contradictions with the user, incorporate completed fact-finding, and
   expose the newly ready frontier. Repeat steps 2–4 until no in-scope branch
   remains silently assumed.

   **Done when:** the frontier is empty and every deferred item has a named
   owner or is explicitly outside the destination.

5. **Confirm the shared understanding.** Return a compact decision ledger,
   unresolved facts or deferrals, non-goals, and the resulting destination.
   Ask the user to confirm it. Do not implement, write a spec, create tickets,
   or mutate product artifacts until that confirmation and a separate request
   authorizes the next workflow.

   **Done when:** the user confirms the ledger or supplies corrections that
   reopen a named branch.
