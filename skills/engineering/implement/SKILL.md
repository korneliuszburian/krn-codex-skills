---
name: implement
description: Build or refactor an already-scoped code change in one production-first vertical slice. Use when files should change and the desired behavior or proven cause is clear; skip unresolved faults and read-only review.
---

# Implement

Ship the smallest complete slice through a real caller, public seam, and
observable result. Production code is the work; proof protects the changed
risk.

## Process

### 1. Pin The Slice

Write down:

```text
Outcome:
Caller -> public seam -> observable result:
Owned paths:
Changed risk:
Proof budget: 0 | 1 | N
Focused command:
Completion command:
```

Use the user's acceptance criteria and the closest repository instructions.
When the desired behavior is unclear, resolve it before editing. When a fault's
cause is unknown, switch to `$diagnosing-bugs`.

This step is complete when every planned edit traces to one outcome and the
chosen proof can disagree with the change.

### 2. Select Proof Before Code

Load [behavior-proof.md](references/behavior-proof.md) when runtime behavior,
validation, migration, authority, or a bug contract changes.

- **0** new tests for type-only, mechanical, documentation, topology, or
  behavior-preserving work already observed at the public seam.
- **1** focused falsifier for one changed runtime contract.
- **N** only when each case maps to a distinct acceptance requirement.

Use existing proof before adding a new test. Broad suites are completion
evidence, not the inner loop.

This step is complete when the proof budget has a named risk, or zero has an
existing observer and an explicit reason.

### 3. Build One Vertical Slice

Change the production path from caller to result. Keep the public interface
small and hide complexity behind it. Add an abstraction only when it owns
policy or isolates a real varying or external seam.

For any TypeScript source, declaration, or compiler-configuration change, load
[typescript.md](references/typescript.md). Apply its boundary procedure only
as deeply as the changed risk requires.

If a new falsifier is justified, run one red-capable slice, implement only
enough to satisfy it, then review the design. Do not write a horizontal batch
of imagined tests before learning from production code.

This step is complete when the accepted behavior is reachable through the real
public seam and the diff contains no speculative branch.

### 4. Tighten

Run the focused command. Read the resulting diff as a design artifact:

- delete pass-through helpers, unused options, duplicate models, and ceremony
  introduced by this slice;
- preserve strict boundaries instead of weakening types or validation;
- remove temporary probes and artifacts;
- leave unrelated pre-existing cleanup untouched.

Prefer deletion when behavior and proof remain equal.

### 5. Verify The Claim

Run focused proof first. Run typecheck, lint, build, broad tests, rendered
checks, or remote checks only when the repository contract or claimed outcome
requires that level.

For changed TypeScript source, declarations, or compiler configuration, run
the narrowest repository-supported typecheck before completion. Use the root
or workspace typecheck only when no narrower command proves the affected
boundary or the repository contract requires it. Typecheck proves static
relationships, not runtime behavior.

Account for every changed and untracked path. Record:

```text
Outcome:
Production path:
Proof budget and evidence:
Repository gates:
Does not prove:
Publication state:
```

Use `$code-review` for an independent checker pass when the slice is
non-trivial or the user requests review.

## Stop Condition

Stop when the requested outcome is present in production code, every owned path
is accounted for, proportional proof passes or is honestly blocked, and no
remaining work is hidden behind green CI.

## Hard Boundaries

- Keep expected results independent from the implementation algorithm.
- Exercise public behavior instead of private call order.
- Preserve unrelated user changes and external state.
- Separate semantic completion from commit, push, deployment, and CI status.
