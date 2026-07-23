# Frontier-round interview

Use when many user-owned decisions are open and their prerequisites are partly
settled. The decision tree is worked by **frontier rounds**: a frontier is every
open decision whose prerequisites are already settled. Facts belong to the agent;
choices belong to the user.

## Procedure

1. **Frame the tree.** Restate the destination, the in-scope decision, known
   constraints, and explicit non-goals. Inspect the current environment for facts
   before turning them into questions. Keep the tree as working state; do not persist
   it unless the user separately asks for an artifact.

   **Done when:** the root decision is clear enough to distinguish facts,
   user-owned choices, dependencies, and out-of-scope branches.

2. **Compute the frontier.** Include every user decision that can be answered
   without guessing an unresolved prerequisite; hold downstream questions for a
   later round. Investigate discoverable facts directly. When delegation is
   authorized and independent, it may run in parallel while only its descendant
   decisions remain blocked.

   **Done when:** every open branch is either on the current frontier, blocked by a
   named fact or decision, or explicitly out of scope.

3. **Ask one complete round.** Number every frontier question. For each, give a
   recommended answer, the reason it fits the known constraints, and the material
   trade-off. Ask no downstream question in the same round.

   <frontier-round>
   Round:
   Question and user-owned decision:
   Recommended answer:
   Reason and trade-off:
   Unblocks:
   </frontier-round>

   Wait for the user's answers. A recommendation is advice, never a substitute for
   their decision.

   **Done when:** the user has answered, deferred, or rejected every question in the
   round.

4. **Recompute instead of extending the old list.** Apply the answers, resolve
   contradictions with the user, incorporate completed fact-finding, and expose the
   newly ready frontier. Repeat until no in-scope branch remains silently assumed.

   **Done when:** the frontier is empty and every deferred item has a named owner or
   is explicitly outside the destination.

## Confirm

Return a compact decision ledger — the confirmed decisions, unresolved facts or
deferrals, non-goals, and the resulting destination — and ask the user to confirm
it. Do not implement, write a spec, create tickets, or mutate product artifacts
until that confirmation and a separate request authorizes the next workflow.
