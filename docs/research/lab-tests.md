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
| LT-1 | The memory harness (forced `Recall:` + reconstruction + use) changes task outcomes, not only gate output. | Blinded pilot: a repo task set run with the harness vs without it. | Success, rework, wall time, token cost, blinded preference. | No difference, or worse with the harness, or a preference win without semantic preservation. | lab-test | Bounded series 2026-09-11 via `opencode run` (`deepseek-v4.1-flash`): three seeds (unit range; one decimal; zero rendering) with the mechanical recall gate in the treatment fixtures, six runs per lane. Held-out results: unit-range run 1 control wrong (`1048576 PiB` vs `1 ZiB`) but the repeat was correct; one-decimal and zero seeds correct in both lanes on every run. Aggregate: treatment correct 6/6, control correct 5/6; the single control miss did not reproduce. What is shown: the commit-time recall gate fires (deleting a Recall blocks with `unreconstructed-recall`) and treatment is never worse. What is not shown: any robust outcome difference at this scale. Non-proofs: six runs per lane over three seeds, one model, the prompt instructed gate use, prose lesson content delivered mechanically, no retained transcript or CLI version, and no blinding because the held-out check is a deterministic assertion. Status stays `lab-test`; promotion needs many more seeds, repeats, and an independent blinded decider. |
| LT-2 | A second repository adopts the harness and the memory pins and holds across repos. | Blinded pilot: `onboarding-demo` with the harness adopted vs its current managed-block-only state. | Gates present and green, a lesson recorded and delivered, a proof re-run. | The harness cannot install, a lesson cannot be recorded or delivered, or a gate silently depends on this checkout. | lab-test | Proven 2026-09-11 in `onboarding-demo` (HEAD `d240d29`, published) under user-authorized `headless-repair`: the installed `setup-repository-workflow` scaffolded `docs/research/workflow-lessons.md` and the managed memory rule; `package.json` gained `test`, `lessons:check`, `lessons:verify`, and `changes:check`; a real lesson was recorded with a re-runnable Falsifier `test/greet.test.mjs::greets the supplied name@10aa55c`. Evidence: `npm test` passes, `lessons:check` reports no errors, `lessons:verify` runs the proof (`pass`), `memory recall --changed greet.mjs` delivers the lesson, and the `changes:check` gate enforces it — a `greet.mjs` change without a Recall blocks with `unreconstructed-recall`, and adding `Recall: npm run test => greet.mjs` plus `At-risk: test/greet.test.mjs` passes. The harness used the installed `krn-codex`, not this checkout. Non-proofs: one repository; the recorded lesson is a simple demo fact; adoption spans a few runs; the target's `changes:check` inspects `HEAD~1..HEAD`, so it is a per-commit gate rather than a full-history guarantee; and the claim that the installed setup CLI produced the scaffold is procedural provenance, consistent with the artifacts but without a retained run log. |
| LT-3 | A surface change that weakens the change-contract gate is blocked before publication. | Deterministic: the harmful lane (a surface change paired with an unrelated green check) vs the satisfied lane (a changed, pre-existing check). | The change-contract gate (`changes:check`) blocks the harmful lane and passes the satisfied lane. | The harmful lane passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It holds for the tested lanes but not in general: the before-state is declared, so a determined author can pair a change with an unrelated green check. Recorded as a residual in `orchestration.md`. |

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-1` and `LT-2`
are blinded pilots that must run before the memory harness or cross-repo
transfer is described as effective rather than defensive.
