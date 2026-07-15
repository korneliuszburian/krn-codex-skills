# Hard-Bug Escalation

Use the narrowest technique that can falsify the remaining uncertainty. Return
to the ordinary diagnosis loop as soon as one stable cause becomes observable.

## Regression Range

Use bisection when the same deterministic observer can run on both known-good
and known-bad revisions. Preserve the operator's worktree; bisect in a clean
disposable worktree when the target is dirty. Record the first bad revision and
re-run the original symptom there before treating correlation as cause.

## Differential Runs

Compare one variable at a time: old/new revision, runtime, dependency, config,
platform, or dataset. Hold input and environment constant and retain the raw
outputs needed to explain the difference. A changed outcome identifies a
boundary; inspect the causal path before naming a fix.

## Generated Inputs

Use property or fuzz input only when a concrete invariant and bounded input
domain exist. Fix the seed, minimize the first failing case, and retain at most
one stable regression example for one fault. Random volume without an
independent invariant is noise, not proof.

## Timing And Concurrency

Measure a fixed workload and report the reproduction rate. Vary one scheduling,
ordering, timeout, or concurrency control at a time. Use controlled time or a
scheduler seam only when production already owns that boundary; do not export
internals solely to force a race in tests.

## Temporary Observability

Add probes at boundaries, not everywhere. Give every temporary log, trace,
counter, or fault injection a unique marker and remove all occurrences before
completion. Redact secrets and user data before retaining output.

## Human Or Environment Boundary

When the symptom needs unavailable production data, credentials, hardware, or
operator action, stop with the exact artifact or observation needed next. Do
not replace missing access with a confident theory.

## Architecture Follow-Up

Fix the proven fault first. Record a separate architecture follow-up only when
the diagnosis demonstrates a missing public seam, duplicated policy, or
ownership boundary that is likely to recreate the same class of failure. Name
its consumer and falsifier; avoid a ceremonial post-mortem document.
