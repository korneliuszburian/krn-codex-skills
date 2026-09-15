# ADR 0003: Finite release decision replaces the open-ended hunt

- Status: accepted
- Date: 2026-09-15
- Decision owner: KRN skill-system maintainer
- Evidence: an external read-only review of `6e7e616` plus the harness audits
  recorded in [orchestration.md](../research/orchestration.md)

## Context

The judge-swarm polishing loop ran as an open-ended search: commission read-only
lanes, verify each finding, fix it, and on exhaustion commission a fresh-source
scan and another swarm. By 2026-09-15 that produced 65 commits in one day, 29 of
them touching code, with the last rounds dominated by low-severity test nits and
an occasional real path-safety bug. The loop has no natural zero — the space of
edge cases is unbounded, so "how much more" is "infinitely more" without a
stopping rule. An external read-only review at `6e7e616` judged the harness fit
for cooperative single-writer "memory + gates" but found the acceptance criteria
producer-controlled, and named one structural blind spot the maintainer had not
recorded.

## Decision

1. Stop open-ended read-only bug hunts as a default. Adopt a finite release
   decision as the definition of done: freeze the SHA and the guarantee scope;
   independently execute a positive and a negative fixture for each claimed core
   boundary; observe the existing gate passing on that SHA; demonstrate one
   interrupted/resumed outcome without transcript reconstruction; disposition
   every material finding as repaired, explicitly accepted within the threat
   model, or removed from the advertised guarantee; one fixed-point review checks
   those obligations, then the work closes. Reopen only for an observed
   counterexample, a changed trust boundary or runtime, or a new guarantee.
2. Keep exactly one next capability rather than more machinery: an independently
   owned conformance gate — frozen public-seam fixtures, expected outcomes, and
   applicability rules, executed by a verifier the candidate cannot rewrite. Not
   another ledger, evaluator fleet, or prose checker.
3. Close LT-5 as documented non-promotion
   ([lab-tests.md](../research/lab-tests.md)). The single decisive reopening is
   an independently authored, frozen content-versus-matched-placebo transfer
   confirmation; fund it only when its result changes a concrete adoption
   decision.
4. The review's four code findings were verified against the source, not taken on
   trust: the change-contract preservation branch accepts an unrelated unchanged
   check (`scripts/lib/contract/change-contract.mjs`); `state check` accepts an
   `evidence=` token without binding it to an independently produced result
   (`scripts/lib/state/state-check.mjs`); `lessons verify` runs the author-named
   case green at HEAD and never proves it failed at the recorded anchor
   (`scripts/lib/lessons/lessons-verify.mjs`); and applicability can be erased —
   preserving a lesson's text while narrowing its trigger removes the recall
   obligation. The trigger-withdrawal case is now guarded: a preserved lesson
   whose trigger drops an entry fails `changes check` unless the range declares
   `Applicability-change: <reason>`. The first three stay recorded as residual
   bounds.

## Consequences

- The default response to "another edge case might exist" is no longer a new
  swarm; it needs an observed counterexample or a changed boundary.
- The finite release-decision checklist in
  [orchestration.md](../research/orchestration.md) replaces the
  exhaustion→fresh-scan→swarm policy.
- The blind spot is now mechanical for the trigger case and documented for the
  text and evidence cases.
- The conformance gate is implemented: `config/conformance.json` holds the frozen
  public-seam cases, `krn-codex conformance check` runs them against a candidate
  checkout, and CI runs the base ref's own copy against the candidate with
  `--frozen`, so a change is judged by the acceptance rules that preceded it and a
  case cannot be weakened in place.

## Residual bounds

- This is a single-writer repository, so "independent" can only mean a verifier
  pinned at a fixed ref and a fixture set not authored in the same range as the
  code; true third-party approval is unavailable, and the producer still controls
  which obligations exist.
- The state-evidence and lesson-anchor weaknesses are recorded, not yet guarded.
  A probe of the four legacy rows carrying recorded occurrences found the
  falsifier test file absent at the occurrence commits, so "the case was red at
  the witnessed failure" is not mechanizable for them; `lessons verify` proves
  only green at HEAD, and requiring red at the occurrence would fail closed on
  every row whose test was authored after the failure.
- The conformance ratchet fails closed when a case is removed, so retiring one
  needs a visible workflow edit; the frozen set covers the `changes check`,
  `lessons check`, `memory recall`, `skills check`, and `state` (check/resume)
  seams, not every public command.
- The review's prune directive — retire the optional `unlazy` companion pending a
  second measured real consumer rather than expanding overlapping completion
  machinery — is recorded but not executed: retiring an installable skill is a
  maintainer decision, and the host index apply is blocked separately.

## Rejected alternatives

- Continue the open-ended loop until it reaches "no findings": the loop is
  asymptotic, and a clean round is evidence of a framing's reach, not of the
  absence of defects.
- Add a second ledger, evaluator fleet, or scoring pipeline: the review's own
  warning, and the existing judge-ensembling and MAST-checklist rejections
  already argue against it.
- Defer the blind spot to prose: a preserved-text/narrowed-trigger change was
  silent, so a mechanical check was cheaper than an instruction.

## Supersession rule

Replace this ADR when the finite release decision closes a release that later
shows a counterexample inside the frozen scope, or when the conformance gate makes
independent acceptance a shipped capability rather than a recorded gap.
