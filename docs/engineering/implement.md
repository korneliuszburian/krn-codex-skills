# Implement

## Purpose

Build the smallest complete production slice from a real caller through a
public seam to an observable accepted result.

## Invocation

Model-invocable or explicit as `$implement`.

## Use and skip

Use when files should change and the behavior or proven cause is already
clear. Skip unresolved failures and read-only review.

## Inputs

One outcome, acceptance requirements, caller and public seam, owned paths,
changed risk, fastest disagreeing signal, and required repository gates.

## Output and completion

Working production behavior with a `0/1/N` proof budget, focused evidence,
accounted changed paths, and publication state reported separately. Completion
requires accepted behavior rather than merely green checks.

## Composition

Receives proven causes from `$diagnosing-bugs`, uses
`$typescript-engineering` beside TypeScript changes, and sends non-trivial
fixed diffs to `$code-review`.
