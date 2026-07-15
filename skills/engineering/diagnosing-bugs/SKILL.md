---
name: diagnosing-bugs
description: Diagnose an unknown failure, flake, regression, or slowdown with a red-capable repro or measured baseline before causal hypotheses. Use for broken behavior whose cause is not already proven; repair only when requested.
---

# Diagnosing Bugs

Make the symptom fail on command before explaining it. **A red-capable repro,
or a measured performance baseline, is the entry ticket to causal reasoning.**

1. **Fix authority and the symptom without naming a cause.** Choose
   `diagnose-only` for evidence without mutation or `repair-authorized` when the
   user also asked for a scoped fix. Preserve the exact input and environment
   that produced the report.

   <diagnosis-contract>
   Mode: diagnose-only | repair-authorized
   Expected result:
   Actual result:
   Affected caller or public boundary:
   Exact input and environment:
   Candidate observer:
   Allowed writes:
   </diagnosis-contract>

   **Done when:** authority, symptom, boundary, and candidate observer are
   explicit while no cause has yet been asserted.

2. **Make the symptom observable.** Run the narrowest observer that can
   disagree with the expected result:

   1. one existing test or fixture;
   2. one focused package command;
   3. a CLI, HTTP, browser, runtime, database, or migration smoke with fixed
      input;
   4. a replayed trace or differential known-good versus known-bad run;
   5. a broad suite only when no narrower observer can expose the symptom.

   For a slowdown, measure the same workload in the same environment and
   capture a baseline instead of forcing a binary assertion.

   <repro-record>
   Command or observer:
   Fixed input and environment:
   Expected:
   Observed:
   Reproduction rate or baseline:
   Why this observer can go red:
   </repro-record>

   **Done when:** an already-run command reproduces the wrong result or
   measurable breach, or every available rung is recorded and the exact
   missing artifact, access, or environment is named.

3. **Tighten the loop until the failure is minimal.** Remove one caller, input,
   configuration value, dependency, or environment variable at a time. For a
   flake, raise and record the reproduction rate. Keep everything that remains
   load-bearing.

   Read [hard-bugs.md](references/hard-bugs.md) only when the ordinary loop
   cannot isolate a regression range, race, input family, intermittent fault,
   or environment-only symptom. Return to this loop as soon as one stable
   failure becomes observable.

   If every available observer stays green, stop in `missing-repro` state. Do
   not replace unavailable evidence with a confident code theory.

   **Done when:** the fastest repeatable case still exhibits the original
   symptom, or the next evidence needed from the operator is exact and
   actionable.

4. **Falsify ranked causal hypotheses one variable at a time.** Derive a short
   list from the minimal case, and give every hypothesis a prediction before
   changing anything.

   <causal-hypothesis>
   Proposed cause:
   If true, observing or changing:
   Must produce:
   Result that would falsify it:
   Observation:
   Disposition: survives | rejected | unresolved
   </causal-hypothesis>

   Prefer a debugger or focused inspection, then boundary logs with a unique
   removal marker. Hold the input and environment constant. For performance,
   compare the same workload against the captured baseline.

   **Done when:** one cause survives an observation designed to falsify it, or
   uncertainty is bounded to named alternatives with distinct missing proof.

5. **Stop at evidence or repair only the proven cause.** In `diagnose-only`,
   report the cause and smallest credible repair without mutating production.
   A plausible reading of code without the red-capable chain is not diagnosis.

   In `repair-authorized`, the proven cause has turned the work into a scoped
   change. Continue with `$implement`: carry the minimized repro as its focused
   signal, retain at most one new regression falsifier when a stable public
   seam exists and existing proof is insufficient, apply the smallest
   cause-level slice, then rerun both the minimized and original repro. Remove
   every temporary probe by its marker. A missing public seam is an architecture
   finding, not permission to freeze private call order in a test.

   <diagnosis-result>
   Mode and authority:
   Symptom and public boundary:
   Repro or baseline before:
   Minimal case:
   Proven cause or bounded uncertainty:
   Repair, if authorized:
   Repro after:
   Retained regression proof:
   Temporary probes removed:
   Does not prove:
   </diagnosis-result>

   **Done when:** the symptom and reported cause are connected by reproducible
   evidence, or the exact missing evidence is named; any authorized repair is
   limited to that cause and protected by proportional proof.
