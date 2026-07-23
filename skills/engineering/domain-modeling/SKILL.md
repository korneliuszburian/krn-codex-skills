---
name: domain-modeling
description: Interview every ready decision in frontier rounds, or resolve one contested name or architecture decision, to reach shared understanding; record an ADR or glossary only when earned. Skip implementation, specs, tickets, and passive reading.
---

# Domain Modeling

Reach shared understanding before any artifact or implementation. This skill owns
**two modes**: a frontier-round **interview** when many user-owned decisions are
open, and a focused **concept resolution** when one name, product concept, or
architecture decision is actively contested. Both end at a real boundary used by
people or code, not at a better paragraph. `$implement` owns production writes,
`$to-spec` owns synthesis, `$slice-work` owns decomposition — this skill only
sharpens and, rarely, records a durable decision.

1. **Choose the mode from the shape of the fog.**

   - **Many open decisions** whose prerequisites are partly settled → the
     **frontier-round interview** (step 2). Facts belong to the agent; choices
     belong to the user.
   - **One actively contested meaning** (a public name, product concept, or durable
     architecture decision) → **concept resolution** (step 3).
   - If an external source must justify the choice, compose `$source-to-decision`
     after the conflict is pinned; do not duplicate that workflow here.

   **Done when:** one mode is chosen and the live question is named.

2. **Frontier-round interview.** Work the decision tree by frontier rounds: a
   frontier is every open decision whose prerequisites are already settled. Number
   each frontier question, give a recommended answer with its reason and trade-off,
   ask no downstream question in the same round, and wait for the user — a
   recommendation is advice, never their decision. Recompute the frontier from the
   answers rather than extending the old list, until no in-scope branch is silently
   assumed. Read [frontier-rounds.md](references/frontier-rounds.md) for the full
   round mechanics and the confirmed decision ledger.

   **Done when:** the frontier is empty, every deferred item has a named owner, and
   the user confirms the shared understanding.

3. **Resolve one contested concept.** Pin the live conflict, load only the authority
   that can confirm or contradict a competing meaning, then grill the meanings with
   the smallest realistic scenario that forces them to produce different behavior;
   compare that with current code and runtime, since prose is not automatically
   authoritative.

   <domain-grill>
   Scenario:
   Meaning A predicts:
   Meaning B predicts:
   Current behavior:
   Contradiction:
   Falsifier:
   </domain-grill>

   Choose one canonical term, meaning, owner, and set of invariants; name the
   smallest authoritative surfaces that must change and the stale vocabulary that
   must disappear. Do not preserve a wrong exported name behind an active
   compatibility alias.

   <domain-model>
   Canonical term:
   Meaning and invariants:
   Excluded meanings:
   Owner and consumers:
   Public seams to change:
   Stale active vocabulary to remove:
   First migration slice:
   Decision artifact: not_needed | response | <authorized-path>
   Falsifier:
   </domain-model>

   **Done when:** one model explains the public boundary, assigns its owner, rejects
   the competing meanings, and yields a bounded migration without claiming that
   production already changed.

4. **Record a durable decision only when earned.** Write an ADR or glossary entry
   only when the decision is hard to reverse, surprising without context, and chosen
   through a real trade-off. Routine implementation belongs in code and current
   documentation; a glossary stores the current meaning, never implementation
   history or a future plan. A confirmed interview produces a decision ledger, not
   necessarily an artifact.

   **Done when:** a durable artifact exists only for a decision that earned one, and
   nothing routine is frozen as architecture.

5. **Hand the understanding to its consumer.** Return the confirmed ledger or the
   `<domain-model>`. If the request includes production writes, invoke `$implement`
   with the model as acceptance and the first migration slice as scope; that
   workflow owns edits and proof. If authority is decision-only, return and stop.

   <modeling-result>
   Mode: frontier interview | concept resolution
   Shared understanding / canonical model:
   Durable artifact recorded (if earned):
   Consumer: $implement | $to-spec | $slice-work | $wayfinder | user
   </modeling-result>

   **Done when:** the consumer has an executable decision or bounded handoff, every
   unresolved trade-off has an owner, and this workflow makes no unverified
   implementation claim.
