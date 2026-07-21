# Batch Grill Me

## Purpose

Resolve a decision tree in dependency-ready frontier rounds until the user
confirms complete shared understanding.

## Invocation

Explicit only as `$batch-grill-me`.

## Use and skip

Use when several user-owned choices depend on one another and silent
assumptions would distort the result. Skip ordinary fact lookup, implementation,
specification writing, and ticket creation.

## Inputs

The destination, in-scope root decision, known constraints, non-goals,
discoverable facts, and user-owned choices.

## Output and completion

A user-confirmed decision ledger with settled choices, unresolved facts or
deferrals, named owners, non-goals, and the resulting destination. No product
artifact changes before separate authority.

## Composition

After confirmation, the ledger becomes bounded input to the appropriate owner,
commonly `$source-to-decision`, `$codebase-design`, or `$implement`.
