# ADR 0004: Queue legibility and memory delivery for AFK lanes

- Status: proposed
- Date: 2026-09-18
- Decision owner: KRN skill-system maintainer (operator review before acceptance)
- Evidence: the 2026-09-18 self-hardening arc (sh-31..sh-59: 58 done tickets,
  11 PRs #91–#101, the LT-55..LT-79 rows), the queue attempt ledger, the
  [ticket protocol](../research/ticket-protocol.md), the
  [orchestration synthesis](../research/orchestration.md) rows on the local lane,
  Beads onboarding, and decision-point memory, and the pause audit of
  2026-09-18 (stale capsule fixed point, one lease-expired claim, one discharged
  run cleanup)

## Context

The verification layer is not in question. Every ticket in the arc landed with a
base-red observer, a green gate, an LT row, and stated non-proofs; the
`changes check --before` overlay caught three real defects a worker had missed
(a dead export behind a variable dynamic import, a tier-observer conflict, and an
unregenerated skill export). The measured friction is in legibility, delivery,
and loop economics:

- **In-flight state is invisible in the queue.** Lanes ran 12, 20, and 29
  minutes; the only in-flight state was a worktree, a runner log, and
  `Status: claimed`. A missed closure (sh-56) left a claimed envelope with an
  expired lease for hours and was found only in the operator-requested audit.
- **Rejections are prose, not ledger rows.** The queue records 20 attempts
  across 12 tickets (a ~20% retry rate), but the rejections made during this
  arc's integration were written into ticket constraints, not `ticket fail`
  rows, so the retry vocabulary does not see them.
- **Memory delivery misses the hottest surface.** `memory recall` returned zero
  hits for `scripts/lib/install/**`, where most of the arc's changes and
  findings happened, and one hit for the contract core. The lessons page carries
  fewer than two dozen trigger entries across a 24-row budget, so most lessons
  are undeliverable at decision time. The capsule absorbed the history instead:
  its `Evidence observed` line passed 10k characters in one outcome.
- **Queue mechanics are used at their floor.** All 58 envelopes declare
  `Gate: none`; there are no `Supersedes:`/`Relates:` links, so sh-44's
  supersession by sh-41/sh-43 is prose a check cannot resolve; `ticket check`
  reports 102 warnings dominated by squashed-history artifacts
  (`done-without-commit` 41, `missing-cost` 39, `missing-env-fingerprint` 22)
  plus an orphan probe commit, so the warning channel a fresh session reads is
  mostly noise.
- **The AFK loop stops before publication.** The lab `run-frontier.sh` runs
  next→claim→lane→merge→close with a `stub proof` close and no LT row, PR, CI,
  install, or capsule writeback; `publish.sh` requires explicit authority but
  prints a generic PR. The maintainer performed the integrator sequence by hand
  for every lane, which consumed most of a session's context.
- **Session-start delivery is capsule-only.** The opencode plugin and the Codex
  hook inject a continuing capsule and one advisory adoption line, but nothing
  surfaces the ready frontier in an already-managed repository, and the plugin
  brief is cwd-scoped (a handoff into another checkout received nothing).
- **Tool drift is unrecorded.** opencode 1.18.30 is installed while 1.18.31 is
  published; codex is pinned at 0.154.0 while 0.155.0 is published; the host
  runs node v26.2.0 while `.node-version`/`.nvmrc` pin 22.11.0 and CI uses the
  pin.

The research already settles the boundaries: Beads' queue mechanics are adopted
selectively, KRN's divergence is explicit-only adoption plus decision-point
memory delivery, and a session-start brief is a behavioral claim that needs a
registered lab-test before promotion.

## Decision

Adopt a sequenced, bounded evolution in three tiers, with no second store, no
daemon, and no auto-adoption.

1. **Tier 1 — legibility and loop economics.**
   - **Ticket journal.** A `krn ticket note` verb appends to a `## Lane journal`
     section; the lane runner writes deterministic entries (claim, run dir,
     worktree, branch, worker exit, recovery, gate exit, commit) and the worker
     prompt requires one checkpoint line per phase. `ticket check` does not lint
     journal prose; `ticket board` and the session brief read it.
   - **Attempt discipline.** Every rejected attempt and every integration
     refusal records `ticket fail` with a named signature; add `gate-audit`,
     `export-missing`, `scope-drift`, and `integration-reject` to the signature
     vocabulary.
   - **Session-start queue brief (behavioral, lab-test required).** One bounded
     line naming the ready frontier (at most three ids) plus the claim command,
     emitted only for a repository carrying the managed contract, only when no
     capsule continues, and never writing or adopting anything.
   - **Publication-mode integrator.** Extend the lab loop with policy-aware
     integration: merge, LT row, `gate:fast`, PR from the ticket's acceptance
     and non-proofs, CI watch, squash-or-merge policy, install, close, cleanup,
     stopping on any ambiguity. Review and publication authority stay with the
     maintainer.
2. **Tier 2 — Beads parity where a consumer exists.**
   - **Typed links.** `Supersedes:` and `Relates:` fields, `close
     --superseded-by`, resolved by `ticket check`, with superseded rows visible
     in the board.
   - **Gates wired to close.** `Gate: ci:<check>` requires recorded evidence
     that the named check ran green on the head; `Gate: human:<what>` requires a
     named approval recorded at close.
   - **`krn ticket board`.** The queue with statuses, attempts, and journals for
     humans and for the brief.
3. **Tier 3 — memory and durable knowledge.**
   - **Recall coverage.** Give the hottest surfaces triggers (starting with
     `path:scripts/lib/install/**`) and measure the hit-rate from the lanes'
     committed `Recall` trailers; a lesson with no delivery leaves the budget or
     is retired.
   - **Warning baseline.** Store the historical `ticket check` warning set
     (squashed-history artifacts and the `ticket-show-1` probe) as an explicit
     baseline so new warnings are signal.
   - **`release-trust` topic page.** Consolidate the sh-54..sh-59 arc (committed
     anchor, override audit, atomic ledger, legacy digest, migration
     classification) into one durable research page under the page header ABI.
   - **Capsule slimming.** Keep `Evidence observed` at the current boundary and
     point at LT rows for history.
4. **Tool pins are recorded, not silently tracked.** The lane recipe records its
   opencode version per run; the codex pin stays exact; the CI node pin stays
   22.11.0 with the host v26.2.0 discrepancy documented. Updating opencode to
   1.18.31 and codex to 0.155.0 is an operator decision after this review.

Sequencing: 1a+1b and 2c first (no behavioral claim), then 2a+2b (ABI), then 1c
with its registered pilot, 1d, and 3a–3d. Implementation becomes sh-60+ tickets
with dependency edges after this ADR is accepted.

## Consequences

- The ticket becomes the in-flight view: a stalled lane is legible from the
  queue without reading logs, and every rejection is a ledger row.
- New CLI surface and ABI fields exist and must be linted, versioned, and
  tested; the queue gains state the board and brief depend on.
- The warning channel becomes usable after the baseline; the `ticket-show-1`
  probe is dispositioned instead of tolerated.
- Memory is budgeted by delivery: triggers and hit-rate decide which lessons
  earn their row.
- No behavioral change ships without a lab-test; no publication becomes
  automatic; the maintainer keeps the review and merge authority.
- The local queue stays local files: no GitHub Issues, no Beads backend, no
  daemon, and ignored working state remains ignored.

## Rejected alternatives

- **Full Beads adoption (Dolt store, daemon, second database).** The mechanics
  with a consumer are fields and CLI verbs; a store contradicts the
  no-second-store contract and has no measured consumer here.
- **Auto-adoption hooks (`bd init`-style instruction writing).** Conflicts with
  the explicit-only contract and the measured onboarding design; the queue brief
  is read-only and fires only in repositories that already carry the managed
  contract.
- **GitHub Issues as the tracker.** Publication already uses PRs; a second
  tracker adds review load with no measured consumer and duplicates the ABI.
- **Per-ticket progress logs in git.** The queue is ignored by design; durable
  history stays commits plus the LT registry.
- **A fully autonomous integrator.** Review and publication authority are
  outside the model; the loop stops at ambiguity and hands back.

## Supersession rule

Replace this ADR when a measured legibility, delivery, or automation failure
survives its mechanism, when a host primitive makes a mechanism redundant, when
the queue-brief pilot shows noise in managed repositories without a frontier, or
when a second operator needs shared (non-local) queue state.
