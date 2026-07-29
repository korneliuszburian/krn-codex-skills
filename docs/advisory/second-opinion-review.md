# Second Opinion Review

## Purpose

Obtain a bounded, isolated Claude research, rewrite, or checker pass and turn
its output into locally verified advisory evidence.

## Invocation

Explicit only as `$second-opinion-review`.

## Use and skip

Use for a genuine independent evidence campaign, disposable rewrite candidate,
or one fixed-point checker. Skip routine implementation, ordinary code review,
and open-ended reviewer loops.

## Inputs

A role, fixed source scope, decision question or rewrite acceptance, bounded
budget and timeout, source coverage, local artifacts, and retained consumer.

## Output and completion

A validated result and local disposition under the repository's configured,
ignored `<working_runs>/second-opinion-review/<run-id>`. The owning repository
is explicit through `SECOND_OPINION_CONTEXT_ROOT`; genuinely ad-hoc work must
declare an absolute `SECOND_OPINION_WORKING_RUNS` and uses the same layout.
The resolved absolute workflow directory is the skill's `OUTPUT_ROOT`; it is
recorded in `pass-context.json`, never inferred from a physical mount prefix.
Checker findings contain at most 20 inclusive evidence lines and are split,
not clipped, when a claim needs multiple excerpts.
Only consumer-owned final reports may be retained under the configured
`<retained_reports>/second-opinion-review/`; reviewer prose alone is never
approval or readiness.

## Composition

Validated research ledgers must feed `$source-to-decision` before any local
adoption or implementation decision. Accepted checker or rewrite fixes use
`$implement`; final fixed diffs use `$code-review`. The initiating workflow
owns any repository report and cleanup decision.
