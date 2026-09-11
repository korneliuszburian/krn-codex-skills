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
| LT-1 | The memory harness (forced `Recall:` + reconstruction + use) changes task outcomes, not only gate output. | Blinded pilot: a repo task set run with the harness vs without it. | Success, rework, wall time, token cost, blinded preference. | No difference, or worse with the harness, or a preference win without semantic preservation. | lab-test | Bounded pilot run 2026-09-11 via `opencode run` (`deepseek-v4.1-flash`) with the mechanical recall gate exercised: one seeded task, one run per lane, one model. The treatment fixture carries a lesson with `Trigger: path:format.mjs` and a `changes:check` gate; the control has none. The prompt for both lanes is to implement `formatBytes`, commit, and make `changes:check` pass. Facts: both lanes pass the visible `1024` test and `changes:check`; the held-out case `formatBytes(1024**7)` returned `1048576 PiB` (clamped unit list) in control and `1 ZiB` in treatment; the treatment commit carries `Recall: test => format.mjs`, and deleting that trailer makes `changes:check` block with `unreconstructed-recall`. What is shown: the commit-time recall gate fired on the triggered file, and the treatment's delivered file differs on the held-out case while its lesson Evidence text names the EiB-to-ZiB case, so the lesson content encoded the expectation. What is not shown: no captured transcript proves the agent consulted the lesson mid-task, so the causal attribution is inferred from the gate firing and the differing output. Non-proofs: n=1 per lane, one model, a single sample with uncontrolled variance (the delivered files differ beyond the unit list, so outcomes vary for other reasons too), the prompt instructed the agent to satisfy the gate, there was no blinding at all because the held-out check is a deterministic assertion rather than a blinded decider, and no prompt transcript or CLI version was retained. Status stays `lab-test`. |
| LT-2 | A second repository adopts the harness and the memory pins and holds across repos. | Blinded pilot: `onboarding-demo` with the harness adopted vs its current managed-block-only state. | Gates present and green, a lesson recorded and delivered, a proof re-run. | The harness cannot install, a lesson cannot be recorded or delivered, or a gate silently depends on this checkout. | lab-test | Fresh-repository adoption now holds: `setup-repository-workflow` scaffolds `docs/research/workflow-lessons.md` and a managed rule to run the installed `krn-codex lessons check`/`verify`, and `test:setup` shows a fresh repo adopts memory (`lessons check` is not skipped and reports no errors) while an existing page is preserved. The harness uses the installed CLI, not this checkout. The `onboarding-demo` pilot itself remains blocked: its adoption writes need explicit `headless-repair` authority under `$target-repo-work`, and a pre-adoption observation there showed the harness inert (lessons skipped, changes a no-op, state not-applicable, skills check exits 1) because the repo has no memory page or gates. |
| LT-3 | A surface change that weakens the change-contract gate is blocked before publication. | Deterministic: the harmful lane (a surface change paired with an unrelated green check) vs the satisfied lane (a changed, pre-existing check). | The change-contract gate (`changes:check`) blocks the harmful lane and passes the satisfied lane. | The harmful lane passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It holds for the tested lanes but not in general: the before-state is declared, so a determined author can pair a change with an unrelated green check. Recorded as a residual in `orchestration.md`. |

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-1` and `LT-2`
are blinded pilots that must run before the memory harness or cross-repo
transfer is described as effective rather than defensive.
