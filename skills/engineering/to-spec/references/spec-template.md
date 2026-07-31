# Spec template

A spec is destination-first synthesis of a settled conversation. Fill it from
what is already decided; route anything still open to its smallest typed
decision owner instead of guessing. Use the repository's domain glossary
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

## Decision Sources

One source identity and one-line resolution for each load-bearing decision. Link
the Wayfinder or other tracker ticket when one exists; otherwise name the active
thread, ADR, or decision owner. Full rationale and evidence remain at that source.

## Resolved Implementation Decisions

The decisions made: modules built or modified, their interfaces, schema changes,
API contracts, and specific interactions. Use repository vocabulary throughout.
Do not include file paths or code snippets — they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state
machine, reducer, schema, type shape) may be inlined briefly with a note that it
came from a prototype. This section compresses the linked primary sources rather
than replacing them.

## Explicit Unknowns

Only non-gating questions that may remain while implementation starts. Name the
owner and the condition or deadline for resolving each one. If any open question
gates the production route, do not complete this template: return it through the
parent skill to `$domain-modeling`, `$source-to-decision`, `$prototype`,
`$codebase-design`, or the named human owner. `$slice-work` and `$implement`
never receive gating uncertainty.

## Out of Scope

What this spec deliberately does not cover.

## Further Notes

Anything else needed to understand the destination.
</spec-template>

Deliver the filled template to the active outcome owner before any publication.
Publish it once only when
the closest repository `AGENTS.md` or other closest instructions name the
existing destination and publication is authorized; read the destination back
before claiming spec-publication state `PUBLISHED`. When publication was requested without a configured
destination or authority, return it to the active outcome owner with
spec-publication state `PUBLISH_PENDING`. Never invent a fallback path.
