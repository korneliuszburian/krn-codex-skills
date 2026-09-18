# ADR 0005: Continuous hardening with bounded passes

- Status: proposed (operator-reopened; ADR-0003's default stop is replaced)
- Date: 2026-09-18
- Decision owner: KRN skill-system maintainer (operator review)
- Evidence: the 2026-09-18 bounded swarm (four read-only framings) and its
  reproduced findings queued as sh-60..sh-65, the self-hardening arc
  sh-31..sh-59, [ADR 0003](0003-finite-release-decision.md), and the memory
  measurements recorded in [ADR 0004](0004-queue-legibility-and-memory-delivery.md)
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
2. **Signals are not proofs.** Every finding is reproduced deterministically
   before it becomes a ticket, and the reproduction command is recorded in the
   ticket evidence.
3. **ADR-0003 still owns completion.** The finite release decision governs the
   end of an outcome or release; it no longer forbids the next hardening pass.
4. **The reproduced pipeline holes are the first execution batch** (sh-60..sh-65)
   because they weaken the proof layer every later change depends on.
5. **The queue may stay non-empty by design.** A pass ends; a release ends; the
   queue evolves. A permanently empty queue is not a success signal.
6. **Capability is not excluded.** Hardening passes may target product surfaces
   (the unrun LT-8 frontend outcome and the parked sh-35 reconcile are the first
   named candidates), not only harness plumbing.

## Consequences

- Each pass is bounded and evidence-carrying, so the ADR-0003 economics survive;
  the difference is that hardening no longer needs a special reopening.
- Six known holes are queued with falsifiers instead of living in a review
  thread.
- The pass trigger and its disposition become visible in the queue and the
  capsule; a stalled hardening pass is itself an inconsistency.
- More tickets accumulate; the completion discipline (one outcome, one writer,
  finite releases) is unchanged.

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

## Supersession rule

Replace this ADR when a bounded pass can no longer find or fix inconsistencies
without unbounded cost, when the trigger→disposition loop starts producing noise
tickets, or when a host primitive makes the pass redundant. Reopen ADR-0003's
default only if passes measurably degrade the repository.
