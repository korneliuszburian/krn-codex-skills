# Lab tests

Status: `accepted`. Consumer: `$source-to-decision` and the maintainer.
Owner: maintainer. Verified: 2026-09-11. This page makes bounded, blinded pilots
the mandatory evidence for any behavioral claim in this repository; it records
the registry and the non-proofs, and it is not itself proof that a mechanism
works.

## Contract

A mechanism, lesson, or skill that claims to change agent behavior may be
promoted from `lab-test` to `adopted` only when a registered lab-test in this
page reports a result. A claim without a result stays `lab-test`. A lab-test
takes one of two forms:

- a **blinded pilot**, required for a claim about human or agent outcomes. It
  names the lanes (control and treatment) and the only difference between them;
  the decider sees anonymized outputs and not the lane; the metrics are task
  success, rework, wall time, token cost, and a semantic or acceptance check;
  and it states the result that would reject the claim.
- a **deterministic differential check**, sufficient for a claim that a
  mechanism fires or a gate blocks. It names the two inputs and the observed
  difference, and it still records its non-proofs.

Non-proofs are what the lab-test cannot show at this scale. Raw fixtures stay
outside the repository; only the protocol, the aggregate result, and its limits
are durable.

## Registry

| Id | Claim | Form and lanes | Metric | Falsifier | Status | Result / non-proof |
|---|---|---|---|---|---|---|
| LT-1 | The memory harness (forced `Recall:` + reconstruction + use) changes task outcomes, not only gate output. | Blinded pilot: a repo task set run with the harness vs without it. | Success, rework, wall time, token cost, blinded preference. | No difference, or worse with the harness, or a preference win without semantic preservation. | lab-test | Bounded probe 2026-09-11 via `opencode run` with `deepseek-v4.1-flash`, not a blinded pilot: one seeded task (implement `formatBytes`), one run per lane, lanes differing only by a standing rule in the fixture `AGENTS.md`. The held-out case `formatBytes(1024**7)` returned `1024 EiB` (unit list clamped at EiB) in control and `1 ZiB` in treatment, while the visible `1024` test passed in both. What it shows: a directly delivered standing instruction changed the output for a case the visible test could not distinguish. What it does not show: the memory-harness claim, because no `Recall:`/reconstruction/recall gate occurred and the rule largely encoded the held-out expectation. Non-proofs: n=1 per lane, one task and one model, a single sample whose delivered files differ beyond the unit list so variance is uncontrolled, and no multi-run variance or human blinding beyond the held-out grader. Status stays `lab-test`; the recall-gate mechanism is still unrun, and a first attempt with a contradictory seed was discarded as invalid. |
| LT-2 | A second repository adopts the harness and the memory pins and holds across repos. | Blinded pilot: `onboarding-demo` with the harness adopted vs its current managed-block-only state. | Gates present and green, a lesson recorded and delivered, a proof re-run. | The harness cannot install, a lesson cannot be recorded or delivered, or a gate silently depends on this checkout. | lab-test | Pre-adoption observation-only crossing 2026-09-11 into `onboarding-demo` (HEAD `6ab14e0`, clean): `state check <path>` returned `not-applicable`; `changes check --base HEAD~1` returned no errors; `lessons check --root` was `skipped` with no memory page (now warns `memory is not adopted at this root`); `skills check --root` exited 1 (`.agents/skills` missing, the target does not export a skill set). The LT-2 metric was not met, so this is not a pilot result: the harness is per-repo and inert until adopted. Blocker for the pilot: adoption writes in the target require explicit `headless-repair` authority under `$target-repo-work`. |
| LT-3 | A surface change that weakens the change-contract gate is blocked before publication. | Deterministic: the harmful lane (a surface change paired with an unrelated green check) vs the satisfied lane (a changed, pre-existing check). | The change-contract gate (`changes:check`) blocks the harmful lane and passes the satisfied lane. | The harmful lane passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It holds for the tested lanes but not in general: the before-state is declared, so a determined author can pair a change with an unrelated green check. Recorded as a residual in `orchestration.md`. |

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-1` and `LT-2`
are blinded pilots that must run before the memory harness or cross-repo
transfer is described as effective rather than defensive.
