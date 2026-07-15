# Architecture Audit

Find concrete change friction before proposing a refactor. File size is a clue,
not a verdict; a large cohesive module may be deeper than several small files
that leak one policy across callers.

## 1. Pin The Scope

Name the package, subsystem, or changed surface and whether the audit covers
current code, a fixed-point diff, or recent history. Keep the audit read-only.
Do not silently turn “find opportunities” into a repository-wide rewrite.

## 2. Gather Friction

Use current code and the cheapest available history to look for:

- one behavior requiring edits across unrelated callers;
- repeated policy, validation, state dispatch, or error recovery;
- callers sequencing another module's internals;
- a public contract exposing storage, transport, or pipeline history;
- a module changing for unrelated reasons;
- bug or test friction caused by a missing production seam;
- recent churn concentrated around the same ownership boundary.

Treat line count, dependency fan-out, and test volume as navigation signals
only. Retain a candidate only when current paths demonstrate a concrete cost.

## 3. Rank Candidates

Report at most three candidates:

```text
Candidate and evidence:
Current caller knowledge:
Leaked or duplicated policy:
Likely deeper seam:
Expected deletion or locality gain:
Migration risk:
```

Rank by repeated change cost and interface leakage, not aesthetic preference.
Reject candidates that merely need a rename, formatting cleanup, or speculative
abstraction.

## 4. Deepen One Boundary

For the strongest candidate, run the deletion test and compare two designs that
differ in ownership. Identify the real caller, smallest useful interface,
hidden behavior, failure model, proof surface, and incremental migration slice.

Hand an authorized change to `$implement` as one vertical slice. Otherwise stop
with the ranked audit and explicit non-proof; do not edit during discovery.
