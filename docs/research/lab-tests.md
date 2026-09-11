# Lab tests

Status: `accepted`. Consumer: `$source-to-decision` and the maintainer.
Owner: maintainer. Verified: 2026-09-11. This page makes bounded, blinded pilots the
mandatory evidence for any behavioral claim in this repository; it records the
registry and the non-proofs, and it is not itself proof that a mechanism works.

## Contract

A mechanism, lesson, or skill that claims to change agent behavior may be
promoted only from `lab-test` to `adopted` when a registered pilot in this page
reports a result. A claim without a pilot stays `lab-test`. A pilot names:

- the claim and the observable it should move;
- the lanes (control and treatment) and the only difference between them;
- blinding: the decider sees anonymized outputs and not the lane;
- metrics: task success, rework, wall time, token cost, and a semantic or
  acceptance check;
- the falsifier: the result that would reject the claim;
- the non-proofs: what the pilot cannot show at this scale.

Results and non-proofs are recorded here; raw fixtures stay outside the
repository, and only the protocol, the aggregate result, and its limits are
durable.

## Registry

| Id | Claim | Lanes | Metric | Falsifier | Status | Result / non-proof |
|---|---|---|---|---|---|---|
| LT-1 | The memory harness (forced `Recall:` + reconstruction + use) changes task outcomes, not only gate output. | A repo task set run with the harness vs without it. | Success, rework, wall time, token cost, blinded preference. | No difference, or worse with the harness, or a preference win without semantic preservation. | proposed | Blocker: needs a bounded task set and two blinded lanes; no LLM runs recorded yet. |
| LT-2 | A second repository adopts the harness and the memory pins and holds across repos. | `onboarding-demo` with the harness adopted vs its current managed-block-only state. | Gates present and green, a lesson recorded and delivered, a proof re-run. | The harness cannot install, a lesson cannot be recorded or delivered, or a gate silently depends on this checkout. | proposed | Measured 2026-09-11: `onboarding-demo` carries the managed `krn-agent-workflow` block and ignored `.krn/runs` but no `docs/research`, gates, or `package.json`; the harness is per-repo and does not transfer on its own. |
| LT-3 | The gate suite catches a harmful surface change before publication. | A surface change that weakens a gate vs the same change with the contract satisfied. | The four gates block the harmful lane and pass the satisfied lane. | The harmful lane passes all gates. | lab-test | Deterministic, not a human pilot: the contract before-state is declared, so a determined author can pair a change with an unrelated green check. Recorded as a residual in `orchestration.md`. |

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is already a deterministic lab-test with a documented residual; `LT-1`
and `LT-2` are proposed and must run before the memory harness or cross-repo
transfer is described as effective rather than defensive.
