---
name: domain-modeling
description: Resolve an actively changing public name, product concept, ubiquitous-language conflict, or rare durable architecture decision. Use when one live meaning or owner must replace competing meanings; skip passive reading, ordinary implementation naming, and routine design choices.
---

# Domain Modeling

**One active concept, one meaning.** Resolve it everywhere it matters. The work
ends at a real boundary used by people or code, not at a better paragraph.

1. **Pin the live conflict.** Name the decision before reading broadly.

   <domain-question>
   Change: public naming | product concept | durable architecture decision
   Current term or decision:
   Competing meanings:
   Public seam:
   Owner:
   Consumers:
   Observed contradiction:
   Reversibility and trade-off:
   Change authority: decision-only | domain-artifact | production-handoff
   </domain-question>

   **Done when:** two plausible meanings can be distinguished at a named
   public seam and the decision has an owner.

2. **Load only the live authority.** For naming, inspect the exported symbol,
   API, CLI, or UI wording plus its closest glossary entry. For a product
   concept, inspect the context map, owning behavior, and current consumers.
   For a durable decision, inspect the architecture boundary and the
   repository's decision-record policy. Read history only when it still
   explains active authority; preserve records that no longer participate in
   that authority.

   If an external source must justify the choice, compose
   `$source-to-decision` after the conflict is pinned; do not duplicate that
   workflow here.

   **Done when:** every loaded artifact can confirm or contradict one competing
   meaning; unrelated domain history remains unloaded.

3. **Grill the meanings.** Invent the smallest realistic scenario that forces
   the alternatives to produce different language, ownership, or behavior.
   Compare that scenario with current code and runtime behavior; prose is not
   automatically authoritative.

   <domain-grill>
   Scenario:
   Meaning A predicts:
   Meaning B predicts:
   Current behavior:
   Contradiction:
   Falsifier:
   </domain-grill>

   **Done when:** the alternatives disagree observably and the preferred model
   can still be proven wrong.

4. **Choose one model and its migration.** Select one canonical term,
   definition, owner, and set of invariants. Name the smallest authoritative
   surfaces that must change and the stale vocabulary that must disappear.
   Do not preserve a wrong exported name behind an active compatibility alias.

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

   Record a durable decision only when it is hard to reverse, surprising
   without context, and chosen through a real trade-off. Routine implementation
   belongs in code and current documentation. A glossary stores the current
   meaning, never implementation history or a future plan.

   **Done when:** one model explains the public boundary, assigns its owner,
   rejects the competing meanings, and yields a bounded migration without
   claiming that production already changed.

5. **Hand the model to its consumer.** If the request includes production
   writes, invoke `$implement` with the `<domain-model>` as acceptance, the
   first migration slice as scope, and the named public-seam falsifier. That
   workflow owns edits and proof. If authority is `decision-only`, return the
   model and stop; if an explicit domain artifact was requested, write only
   that artifact and do not imply production adoption.

   **Done when:** the consumer has an executable decision or bounded handoff,
   every unresolved trade-off has an owner, and this workflow makes no
   unverified implementation claim.
