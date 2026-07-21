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
ignored `working_runs` role, with a private global fallback when no resolver
exists. Only consumer-owned final reports may be retained under
`docs/agents/reports/second-opinion-review/`; reviewer prose alone is never
approval or readiness.

## Composition

Research recommendations may feed `$source-to-decision`; accepted fixes use
`$implement`; final fixed diffs use `$code-review`. The initiating workflow
owns any repository report and cleanup decision.
