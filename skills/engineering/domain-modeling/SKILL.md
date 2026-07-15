---
name: domain-modeling
description: Resolve or sharpen a product term, public concept, ubiquitous language, or rare durable architecture decision. Use when language or ownership is actively changing; skip passive reading of existing domain docs.
---

# Domain Modeling

Make one concept precise enough that people, code, interfaces, and proof use the
same language.

## Process

1. Find the current glossary, context map, code symbol, public wording, and
   decision record that claim the concept.
2. State the ambiguity as concrete competing meanings. Invent edge scenarios
   that force the meanings apart.
3. Check current code and behavior. Surface contradictions instead of treating
   prose as automatically authoritative.
4. Choose one canonical term, owner, invariants, and excluded meanings.
5. Update the smallest authoritative surface immediately. Rename the exported
   boundary when the exported name is wrong; a local alias does not resolve the
   model.
6. Record an ADR only when the decision is hard to reverse, surprising without
   context, and the result of a real trade-off.

## Output

```text
Concept:
Canonical term:
Meaning and invariants:
Excluded meanings:
Owner and consumers:
Code/doc changes:
Decision record: not_needed | <path>
Falsifier:
```

## Stop Condition

Stop when one authoritative meaning is reflected at the public boundary, stale
active vocabulary is removed, and a realistic scenario can falsify the model.

## Hard Boundaries

- A glossary stores domain meaning, not implementation history or plans.
- An ADR records a durable trade-off, not routine implementation.
- Reading a domain document for vocabulary does not invoke this workflow.
- Preserve historical records unless they falsely participate in the active
  authority surface.
