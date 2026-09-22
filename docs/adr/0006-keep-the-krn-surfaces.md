# ADR 0006: Keep the KRN surfaces with a recorded cost

- Status: accepted (operator direction 2026-09-20; amended 2026-09-21: the decision-point memory delivery is retired, see LT-104)
- Date: 2026-09-20
- Decision owner: KRN skill-system maintainer (operator decision)
- Evidence: LT-102 (toy baseline), LT-103 (SWE-bench
  Verified slice: full 5/5 against vanilla 5/5, four of five patches identical,
  full spending about 1.13M more tokens and about twice the wall), LT-104
  (LongMemEval-S: vanilla 4/5, full 5/5, no-memory 5/5; earlier 1/3, 3/3, 2/3;
  MemoryAgentBench Conflict Resolution: both lanes 1/1), LT-105 (Terminal-Bench:
  oracle proven, KRN lanes blocked by provider reachability in the task
  container), and the 2026-09-20 operator scope decision

## Context

The measurement phase asked whether the KRN surfaces (skills, the session brief,
the guard hooks, and decision-point memory delivery) change task outcomes
against a vanilla lane, with the rule that a component without contribution
disappears. The recorded evidence is consistent: on the toy task set and on a
five-instance SWE-bench Verified slice the surfaces show no measurable
pass-rate contribution because a strong model already passes without them, while
they cost about twice the tokens and wall; the LongMemEval-S smoke shows a weak,
noisy positive signal that the memory instruction alone does not explain; and
the memory benchmark and Terminal-Bench runs are saturated or blocked. The
surfaces are workflow discipline (gates, queue, restart, memory delivery), not a
code-solving substitute, so a code benchmark is a partial instrument at best.

## Decision

Keep the KRN surfaces as the default. Record the measured cost as the price of
the workflow discipline, and do not retire a component on evidence that cannot
discriminate. The adoption-ledger row for the surfaces carries the owner, this
evidence, an expiry, and the retirement trigger. Reopen the decision when a
discriminative benchmark (instances where the vanilla lane fails) shows a
negative contribution, when a measured failure traces to a surface, or when the
operator changes the scope.

## Consequences

- The cost is explicit and owned, not hidden: a paired run costs about twice the
  vanilla tokens and wall on the measured slices.
- A component without measured contribution is kept only while the operator
  accepts the cost and the evidence stays non-discriminative; the ledger expiry
  forces the next review.
- The measurement instruments and the scale runners stay in the repository so a
  later discriminative run is reproducible.

## Rejected alternatives

- **Retire the surfaces on the current evidence.** The evidence cannot
  discriminate: vanilla passes the same tasks, so a zero delta is a ceiling, not
  proof of no value.
- **Make the surfaces opt-in for non-trivial work now.** A defensible future
  scope, but it is a design change without a measured trigger; it stays the
  named reopening option rather than an untested default.
- **Keep measuring without a decision.** The measured cost is real; recording
  the decision and the expiry is the bounded alternative to an open-ended loop.

## Amendment (2026-09-21)

The decision-point memory delivery (the instruction to run `krn memory recall`
before editing) is retired. LT-104's decisive-lesson test showed that a strong
model already reads `docs/research/workflow-lessons.md` unprompted, so the
delivery added no measurable pass-rate contribution (vanilla, no-memory, and
full all passed 9/9) while costing about 40-60% more tokens; the instruction was
also duplicated across the global contract, the delivery-loop skill, and three
harness adapters, so the `memory` component had no unique behavior. The
`krn memory recall` and `usage` CLI, the lessons machinery, and the commit-guard
recall enforcement stay, because their consumer is `changes check`, not the
agent prompt. The skills, brief, and hook surfaces stay under the decision above.
The measured deltas were taken under a harness whose deciding check the agent
could read and modify (sh-142 fixed that), so the null results establish the
overhead, not the absence of benefit; the honest disposition is that outcome
benefit is unestablished and the recorded cost is the price of the discipline.

## Supersession rule

Replace this ADR when a discriminative benchmark shows a negative contribution
for a named surface, when a measured failure traces to a surface, or when the
operator changes the scope; the successor must name who removes the retired
surface and update the adoption ledger.
