# Spec template

A spec is destination-first synthesis of a settled conversation. Fill it from
what is already decided; route anything still open to `$batch-grill-me` or
`$domain-modeling` instead of guessing. Use the repository's domain glossary
vocabulary and respect ADRs in the touched area.

<spec-template>
## Destination

One or two lines: what reaching the end of this effort looks like — the
observable result this spec is aimed at. Every later session orients to this
before choosing work.

## Problem Statement

The problem from the user's perspective.

## Solution

The solution from the user's perspective.

## Acceptance

The observable result that means the outcome is present, stated at the
**highest existing public seam** at which it can be observed. Name the seam and
any existing observer that already covers part of it. This declares where
success is checked, not a test-first mandate; `$implement` chooses the `0/1/N`
proof budget from changed risk.

## Resolved Implementation Decisions

The decisions made: modules built or modified, their interfaces, schema changes,
API contracts, and specific interactions. Use repository vocabulary throughout.
Do not include file paths or code snippets — they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state
machine, reducer, schema, type shape) may be inlined briefly with a note that it
came from a prototype.

## Explicit Unknowns

Every question still open that gates implementation. Each one is a handoff, not
a guess — name it and the owner (`$batch-grill-me`, `$domain-modeling`, a human
decision) so `$slice-work` does not slice uncertainty.

## Out of Scope

What this spec deliberately does not cover.

## Further Notes

Anything else needed to understand the destination.
</spec-template>

Publish the filled spec once to the location in `docs/agents/issue-tracker.md`,
or to `.scratch/<feature>/spec.md` if no tracker is configured. Link it from the
tracker item that will drive implementation. Do not duplicate it elsewhere.
