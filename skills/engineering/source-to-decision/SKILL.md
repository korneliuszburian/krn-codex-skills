---
name: source-to-decision
description: Turn external documentation, papers, practitioner material, or user-provided sources into an owned engineering decision. Use when a source must justify adoption, rejection, a lab test, or deferral; skip ordinary code inspection and fact lookup.
---

# Source To Decision

A source is useful when a mechanism changes a named consumer and can be
falsified. A pile of notes is not a decision.

## Process

### 1. Pin The Question

State:

```text
Decision question:
Consumer:
Current uncertainty:
Evidence needed:
Non-proof boundary:
```

Use primary sources for product mechanics, specifications, APIs, and current
platform behavior. User-provided private material may be analyzed for the
authorized task without being copied into the repository.

### 2. Extract Mechanisms

For every claim worth retaining, map:

```text
Source and version:
Observed mechanism:
Conditions and limitations:
Counterexample:
Current local evidence:
```

Separate what the source states from an inference. Compare claims against
current code, runtime behavior, and repository authority.

### 3. Decide

Choose exactly one disposition:

- **adopt** — the mechanism fits a named consumer now;
- **reject** — current evidence or product boundaries contradict it;
- **lab-test** — a bounded experiment can resolve the uncertainty;
- **defer** — a required consumer, owner, or falsifier does not exist.

Record:

```text
KRN or project implication:
Decision:
Owner:
Consumer:
Falsifier or experiment:
Does not prove:
```

### 4. Store Only The Durable Result

Write the decision to the repository's existing authority surface when one is
needed. Keep citations near the claim. Store reusable runtime knowledge in the
product's actual memory or database owner, not a new Markdown archive.

For a private course or book, commit only original mechanisms and provenance.
Do not reproduce passages, exercises, solutions, or raw extraction.

## Stop Condition

Stop when every retained claim has provenance, mechanism, disposition,
consumer, falsifier, and non-proof; rejected and deferred paths are explicit;
and no raw corpus was added as runtime context.

## Hard Boundaries

- Source popularity is not mechanism evidence.
- External review and green tests cannot decide a product trade-off.
- Local code inspection alone is ordinary engineering, not this workflow.
- A citation supports the nearby claim only; it does not confer authority on
  unrelated conclusions.
