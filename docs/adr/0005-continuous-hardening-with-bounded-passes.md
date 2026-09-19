# ADR 0005: Continuous hardening with bounded passes

- Status: accepted (operator direction 2026-09-18; amended after the independent
  quality review; amended 2026-09-19 to make the operational-state handoff
  durable against a volatile checkout; ADR-0003's default stop is replaced)
- Date: 2026-09-18 (durable-handoff amendment 2026-09-19)
- Decision owner: KRN skill-system maintainer (operator review)
- Evidence: the 2026-09-18 bounded swarm (four read-only framings) and its
  reproduced findings queued as sh-60..sh-65, the self-hardening arc
  sh-31..sh-59, [ADR 0003](0003-finite-release-decision.md), the memory
  measurements recorded in [ADR 0004](0004-queue-legibility-and-memory-delivery.md),
  and the 2026-09-19 volatile-checkout loss and recovery (sh-80)
- Supersedes: ADR-0003's stop rule only — the finite completion unit survives

## Context

ADR-0003 stopped open-ended judge swarms after a day of low-severity nit
fixing. It was right about unbounded loops and it remains right about release
completion. But it also made "do not launch a fresh scan" the default, and the
operator reports the system standing still and asks for continuous improvement
of logical, architectural, and pipeline inconsistencies.

The bounded swarm confirms the stall with measurements and repros. The last arc
was harness-internal (27 tickets, no skill capability change); the frontend
outcome (LT-8) is registered and unrun; the lane runner lives outside the
repository; memory delivery reached 1 of 29 arc commits (2.2% over the last 181
commits); the capsule is 32.8 KB with 91.5% narrative that the checks do not
read. Six holes were reproduced, not argued:

- a `green->green` contract is a blank check — an unrelated, unchanged, passing
  test seals a behavioral change (`errors: []`), queued as sh-60;
- `ticket close` without `--base` skips the scope check and writes `done`,
  queued as sh-61;
- the lane sandbox binds the fixture and the shared git directory read-write and
  its preflight misreads a green `npm run` check as red, queued as sh-62;
- the seal ledger accepts delete-then-reseal, queued as sh-63;
- capsule review evidence accepts a bare word, queued as sh-64;
- the LT registry has a missing id (LT-51) and a duplicated, contradictory row
  (LT-57), queued as sh-65.

## Decision

1. **Continuous hardening is the standing posture.** Each pass is triggered by
   an observed inconsistency (a reproduced bypass, a failed gate, a measured
   delivery gap, or a new architecture seam), names its surfaces, has a bounded
   budget, runs deterministic checks first and model review second, and ends
   when every finding is dispositioned as a ticket, an ADR, a lesson, or a
   retirement. No unbounded judge loops, and no re-sweeping an unchanged surface
   without a new trigger.
   The **observer of record** is the maintainer session at outcome bind: before
   opening an outcome it reads the queue frontier (`krn ticket check`),
   `krn state check`, the session-start queue brief, and the named tripwire list
   below, with the operator as the named backstop. The **producer** is the
   maintainer session or the operator, whichever observed the trigger, and it
   writes the bounded-pass ticket carrying the tripwire that fired. No scheduled
   job, no automatic ticket creation, and no second sensor service observe or
   produce.
   The tripwires are: a red gate on the integrated branch, a reproduced bypass or
   failed falsifier, a `state check` warning, an LT row without an adoption
   decision, a dangling friction candidate, and a memory hit-rate under the
   delivery target. A pass starts only when one of these is named.
   Each pass records itself in the queue as a `decision` or `epic` ticket with a
   numeric budget (wall-clock and token caps plus a finding cap) and an
   exhaustion rule: when the budget is spent, undispositioned findings hand to a
   named successor pass instead of silently widening the current one. The
   numeric budget is wall-clock ≤ 4 hours, tokens ≤ 400k, and findings ≤ 8 per
   pass. The **exhaustion handoff** names the successor: undispositioned findings
   hand to the next pass ticket, owned by the same session and recorded in the
   capsule, instead of widening the current pass. An uncapped pass is not a pass;
   it is the loop ADR-0003 closed.
2. **Signals are not proofs.** Every finding is reproduced deterministically
   before it becomes a ticket, and the reproduction command is recorded in the
   ticket evidence.
3. **ADR-0003 still owns completion.** The finite release decision governs the
   end of an outcome or release; it no longer forbids the next hardening pass.
4. **The reproduced pipeline holes are the first execution batch** (sh-60..sh-65)
   because they weaken the proof layer every later change depends on.
5. **The queue may stay non-empty by design.** A pass ends; a release ends; the
   queue evolves. A permanently empty queue is not a success signal.
6. **Scope order is explicit.** This program closes the harness, memory, and
   queue register first (sh-60..sh-65 plus the review findings queued behind
   them); the product outcome — the unrun LT-8 frontend delivery and the parked
   sh-35 reconcile — waits until the end, per operator direction 2026-09-18.
   When the registers are empty or fully ticketed, the next pass is the product
   outcome, not another harness-only scan.
7. **The cross-family review leg is dark.** The Codex transport returns `401`,
   so every finding in this pass is same-family reviewed; that gap is recorded
   rather than papered over, and restoring a second family is an operator
   action, not a blocker for the sh-60..sh-65 proof-layer fixes.
8. **An active outcome's operational state survives a checkout move by an
   explicit handoff copy and a durable pause export.** The capsule
   (`.krn/runs/delivery-loop/<outcome>/`) and the local queue
   (`.scratch/tickets/`) stay untracked ignored working state, per ADR 0001 and
   ADR 0004; they are per-checkout by design, so a clone inherits neither. A
   copy into the successor checkout's same ignored paths is necessary but not
   sufficient: on a volatile checkout such as `/tmp`, that target is as
   disposable as the source. To move an active outcome, at pause the delivery
   loop **exports** both directories into the documented durable host archive
   `${KRN_OUTCOME_ARCHIVE:-$HOME/.local/state/krn/outcomes}/<outcome>/`, then
   **restores** them by explicit copy into the successor checkout's same ignored
   paths. The archive is an operational copy on the host, never a tracked
   artifact. The successor resumes with `krn state check`, `krn state resume`,
   and `krn ticket next`. No tracked operational artifact is added, because that
   would turn ignored working state into durable knowledge and contradict
   ADR 0001 and ADR 0004. **Falsifier:** pause in checkout A, export to the
   archive, wipe the checkout, restore into checkout B, and resume — the capsule
   continues and `krn ticket next` reports a populated frontier. A bare clone
   that skips the restore stays `not-applicable` at `krn state check` with an
   empty frontier by design, so the archive plus the restore, not a copy into
   another ignored path, are the load-bearing steps.

## Consequences

- Each pass is bounded and evidence-carrying, so the ADR-0003 economics survive;
  the difference is that hardening no longer needs a special reopening.
- Six known holes are queued with falsifiers instead of living in a review
  thread.
- The pass trigger and its disposition become visible in the queue and the
  capsule; a stalled hardening pass is itself an inconsistency.
- More tickets accumulate; the completion discipline (one outcome, one writer,
  finite releases) is unchanged.
- An outcome's operational state is portable by procedure, not by a tracked
  artifact: the capsule and the queue stay ignored, and the documented durable
  pause export plus the explicit handoff restore are what carry them across
  checkouts and survive a volatile source wipe.

## Rejected alternatives

- **Keep ADR-0003's default stop.** The operator overrode it, and the stall is
  measured rather than felt.
- **Unbounded swarm loops.** The ADR-0003 economics still hold; every pass is
  bounded, triggered, and dispositioned.
- **A second store, GitHub Issues, or a scheduler for hardening.** The queue and
  the ADR register already carry the findings; no consumer exists for another
  service.
- **Harness-only hardening.** The stagnation diagnosis shows the plumbing arc is
  done; capability candidates are in scope.
- **A tracked operational export written at pause.** A committed handoff file
  would promote ignored working state into durable knowledge and contradict
  ADR 0001 and ADR 0004; the explicit handoff copy and the durable host archive
  carry the same state without changing what Git tracks.

## Supersession rule

Replace this ADR when a bounded pass can no longer find or fix inconsistencies
without unbounded cost, when the trigger→disposition loop starts producing noise
tickets, or when a host primitive makes the pass redundant. Reopen ADR-0003's
default only if passes measurably degrade the repository.
