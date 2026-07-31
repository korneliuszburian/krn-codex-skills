---
name: domain-modeling
description: Interview ready user-owned decisions in rounds or resolve one contested name, product concept, or durable trade-off. Record shared language in CONTEXT.md or an earned decision in docs/adr/; skip interface design, implementation, specs, and tickets.
---

# Domain Modeling

Reach shared understanding before any artifact or implementation. This skill owns
**two modes**: a frontier-round **interview** when many user-owned decisions are
open, and a focused **concept resolution** when one name, product concept, or
durable trade-off is actively contested. Concrete module, seam, dependency, and
behavior-ownership design from observed code friction belongs to
`$codebase-design`. Both modes here end at a real boundary used by people or
code, not at a better paragraph. `$implement` owns production writes, `$to-spec`
owns synthesis, and `$slice-work` owns decomposition — this skill only sharpens
and, rarely, records a durable decision.

1. **Load current language, then choose the mode.** Read root `CONTEXT.md` when
   present and only the relevant decisions under `docs/adr/`. Treat them as the
   repository's current vocabulary and durable rationale, but compare them with
   current code and runtime before assuming they are still true.

   - **Many open decisions** whose prerequisites are partly settled → the
     **frontier-round interview** (step 2). Facts belong to the agent; choices
     belong to the user.
   - **One actively contested meaning** (a public name, product concept, or
     user-owned durable trade-off) → **concept resolution** (step 3).
   - If an external source must justify the choice, compose `$source-to-decision`
     after the conflict is pinned; do not duplicate that workflow here.

   **Done when:** current vocabulary and relevant ADR constraints are known, one
   mode is chosen, and the live question is named.

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
   CONTEXT.md change: not earned | <current vocabulary change>
   ADR: not earned | docs/adr/<id>-<slug>.md
   ADR supersession rule, if earned:
   Falsifier:
   </domain-model>

   **Done when:** one model explains the public boundary, assigns its owner, rejects
   the competing meanings, and yields a bounded migration without claiming that
   production already changed.

4. **Put each earned fact in its exact owner.** Update root `CONTEXT.md` when a
   confirmed term, meaning, or invariant is shared language that later users, code,
   specs, or reviews must reuse. Keep only current vocabulary there and remove the
   stale competing term; never add status, implementation history, or a future plan.

   Create `docs/adr/<id>-<slug>.md` only when the confirmed durable trade-off is
   hard to reverse, surprising without rationale, and selected through a material
   trade-off. Allocate `<id>` from the repository's closest ADR convention, or the
   next zero-padded four-digit id in its existing sequence (starting at `0001`) when
   no closer convention exists. Record context, decision, consequences, rejected
   alternatives, the falsifier, and the condition and owner for supersession. A routine
   naming choice or confirmed interview ledger does not earn an ADR. Both writes
   require repository write authority; otherwise return the exact proposed update
   without choosing another path.

   **Done when:** reusable current language is in `CONTEXT.md`, an ADR exists only
   for an earned durable trade-off with an explicit supersession rule, and routine
   detail has not become architecture.

5. **Hand the understanding to its consumer.** Return the confirmed ledger or the
   `<domain-model>` to the initiating consumer. That consumer reapplies the global
   routing gate. Only when this workflow was invoked directly and the request
   already includes one clear, authorized production slice may the consumer be
   `$implement`, which then owns edits and proof. If authority is decision-only,
   return and stop.

   <modeling-result>
   Mode: frontier interview | concept resolution
   Shared understanding / canonical model:
   CONTEXT.md update: not earned | pending authority | written
   ADR: not earned | pending authority | docs/adr/<id>-<slug>.md
   Consumer: $implement | $codebase-design | $to-spec | $slice-work | $wayfinder | user
   </modeling-result>

   **Done when:** the consumer has an executable decision or bounded handoff, every
   unresolved trade-off has an owner, and this workflow makes no unverified
   implementation claim.
