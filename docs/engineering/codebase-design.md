# Codebase Design

## Purpose

Resolve observed architecture friction by choosing a deeper module boundary,
smaller caller interface, or clearer dependency owner.

## Invocation

Model-invocable or explicit as `$codebase-design`.

## Use and skip

Use for a named architecture question or an evidence-led hotspot audit. Skip
routine implementation and fixed-point review without a boundary decision.

## Inputs

The current caller or candidate boundary, observed change cost, requested
decision, repository constraints, and implementation authority.

## Output and completion

A bounded design decision naming the caller, chosen interface, policy owner,
rejected alternative, first slice, and falsifier. Completion does not imply
that production was changed.

## Composition

Hands an authorized first slice to `$implement`; architecture discovery itself
remains read-only.
