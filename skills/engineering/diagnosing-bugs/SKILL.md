---
name: diagnosing-bugs
description: Diagnose an unknown failure, flake, regression, or slowdown with a red-capable repro or measured baseline before causal hypotheses. Use for broken behavior whose cause is not already proven; repair only when requested.
---

# Diagnosing Bugs

A tight feedback loop turns an unknown fault into a testable cause. Diagnosis
does not begin with a code theory.

## Choose The Mode

| Mode | Authority | Result |
|---|---|---|
| `diagnose-only` | read-only | evidence-backed cause or bounded uncertainty |
| `repair-authorized` | scoped writes | cause-level fix and focused regression proof |
| `missing-repro` | read-only | attempted ladder and exact missing input or access |

Performance work uses a measured baseline and the same input and environment in
place of a binary red assertion.

## Process

### 1. Make The Symptom Observable

State the expected result, actual result, affected public boundary, and one
candidate command. Do not name a cause.

Try the narrowest observer that can reproduce the user's exact symptom:

1. one existing test or fixture;
2. focused package command;
3. CLI or HTTP call with fixed input;
4. browser or runtime script;
5. database or migration smoke;
6. replayed trace or differential old-versus-new run;
7. broad suite only when no narrower observer can disagree.

This step is complete when one already-run command is red-capable and specific,
or the available evidence proves that a repro is missing.

### 2. Tighten And Minimize

Make the loop faster, sharper, and repeatable. For a flake, raise and record the
reproduction rate. Remove one input, caller, config value, or environment
variable at a time until every remaining part is load-bearing.

If every available rung stays green, switch to `missing-repro`. Ask only for
the artifact, access, or environment that would make the symptom observable.

### 3. Test Causal Hypotheses

Form a short ranked list from the minimal evidence. Give each hypothesis a
prediction:

```text
If <cause>, then changing or observing <variable> will produce <result>.
```

Change one causal variable at a time. Prefer debugger or focused inspection,
then tagged boundary logs. For performance, compare the same workload against
the baseline.

This step is complete when one hypothesis survives an observation that would
have falsified it, or uncertainty is bounded to named alternatives.

### 4. Stop Or Repair

In `diagnose-only`, report the cause and smallest credible fix without
mutation.

In `repair-authorized`:

1. turn the minimized repro into at most one retained regression falsifier when
   a stable public seam exists;
2. apply the smallest cause-level fix;
3. rerun the minimized and original repro;
4. remove temporary instrumentation and harnesses;
5. run only the repository gates required by the changed surface.

Absence of a useful seam is an architecture finding, not permission to freeze
internals in a test.

## Output

```text
Mode:
Symptom and boundary:
Repro or baseline:
Before:
Minimal case:
Cause or bounded uncertainty:
Fix:
After:
Regression proof:
Does not prove:
```

## Stop Condition

Stop when the reported symptom and cause are connected by reproducible
evidence, or the exact missing evidence is named. A plausible code explanation
without a red-capable loop is not diagnosis.

## Hard Boundaries

- Preserve the original input and environment while comparing changes.
- Remove every temporary probe by its unique marker.
- Keep repair scope at the proven cause.
- Add one regression test for one fault, not a taxonomy of imagined variants.
