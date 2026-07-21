# Diagnosing Bugs

## Purpose

Connect an unknown failure, flake, regression, or slowdown to a proven cause
through a red-capable repro or measured baseline.

## Invocation

Model-invocable or explicit as `$diagnosing-bugs`.

## Use and skip

Use when the symptom is real but the cause is not established. Skip already
scoped changes and requests that only ask for review.

## Inputs

Expected and actual behavior, the affected boundary, exact input and
environment, a candidate observer, and repair authority.

## Output and completion

A reproducible symptom-to-cause chain, or bounded uncertainty with the exact
missing evidence. If repair is authorized, completion also includes the
smallest cause-level repair and proportional regression proof.

## Composition

Once the cause is proven, passes the minimized repro and repair scope to
`$implement`. TypeScript-specific boundaries may also use
`$typescript-engineering`.
