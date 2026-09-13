# Lab tests

Status: `accepted`. Consumer: `$source-to-decision` and the maintainer.
Owner: maintainer. Verified: 2026-09-13. This page makes bounded, blinded pilots
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
| LT-1 | Memory delivered at the decision changes task outcomes on decisive tasks; forced reconstruction is tested against content; the neutral stratum that would separate generic priming is deferred to LT-5. | Preregistered 2026-09-12 three-arm outcome run under real isolation: arm A removes the applicable lesson (an ablation, not merely an uninformed reader); arm B adds the lesson content; arm C adds forced reconstruction. Frozen task set; evaluator inaccessible during execution; held-out check. | Held-out success, wall time, and token cost, all required (serving cost is not inferable from length; arXiv:2608.11879). | No content effect beyond a neutral stratum, or enforcement (C) beating content (B) at higher cost. | lab-test | Bounded two-family result: content delivery changes outcomes and is cheaper; enforcement is at ceiling and uninformative. bwrap-isolated run (private /tmp, fixtures outside /tmp, fresh data dirs, random per-run sentinel): 4 decisive tasks x A/B/C. opencode A 0/4 (avg 401s), B 4/4 (21s), C 4/4 (37s); codex A 0/4 (49s), B 4/4 (39s), C 4/4 (40s). Codex tokens A 47.6k, B 38.7k, C 46.2k. Decision: forced reconstruction is advisory by default (`--strict-recall` opts in). Non-proofs: the four tasks were all memory-dependent with no neutral stratum, so nonspecific priming is not separated from a memory effect; B and C both scored 4/4, so the B-vs-C question is a tie at ceiling with one rep and no variance; opencode tokens were not captured, so the cost ordering is codex-only; arm A was an ablation that removes the lesson, so a large A-to-B gap is partly definitional; and the four fixtures and answer keys were not retained, so the result is not independently reproducible. The sandbox exposed the host root read-only. Reopen with the registered LT-5 scale-up. |
| LT-2 | A second repository adopts the harness and the memory pins hold across repos. | Blinded pilot: `onboarding-demo` with the harness adopted vs its managed-block-only state. | Gates green, a lesson recorded and delivered, a proof re-run. | The harness cannot install or a lesson cannot be delivered. | lab-test | Observed twice, single repository. `onboarding-demo` (published) adopted the scaffolded memory page and gate scripts; a real lesson with a re-runnable falsifier is delivered and exercised. Second verification in a disposable worktree: a version bump without a Recall blocks with two `unreconstructed-recall` errors (`path:greet.mjs`, `symbol:VERSION`) plus `unmet-prediction`, and the reconciled commit with both Recall lines and `At-risk` for all three tests passes. Non-proofs: one repository, a simple demo fact, a per-commit gate, procedural provenance without a retained run log, and a harness CI job that skips without secrets. |
| LT-3 | The change-contract gate blocks self-authored, redefined, and unmet checks before publication. | Deterministic: a self-authored/unmet lane vs the satisfied lane (a changed, pre-existing check). | The gate blocks a check introduced or redefined in the range and an unmet prediction, and passes the satisfied lane. | A self-authored or redefined check passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It does not block a change paired with an unrelated pre-existing green check: the before-state is declared, not executed, so a determined author can still pair a change with an unrelated green check. That residual is recorded in `orchestration.md`. The frozen observer compares TAP case names, so a same-name replacement that weakens the body can still mask a dropped assertion. |
| LT-4 | A lesson whose evidence record was superseded is stale even when its own gate still passes, so recall should re-resolve the anchor against current records. | Deterministic differential. Control: a lesson whose referenced record is current. Treatment: a byte-identical lesson row whose referenced record was superseded, differing only by a marker-free supersession link. | The treatment lane is blocked or flagged while the control lane stays green. | The lanes are indistinguishable, or the control blocks. | retired | Retired 2026-09-12 without a differential. The proposed rule (Evidence cell names a path whose `git log <Falsifier-sha>..HEAD -- <path>` is non-empty, fired only for triggered rows) is rejected: Evidence is free prose naming symbols, module basenames, commits, and error strings, not owned paths, so parsing is inert or coincidental; only one row carries a Trigger, so fail-closed coverage is ~1; parsed Evidence paths nearly always coincide with the already-resolved enforcing gate, duplicating `stale-anchor`; and a later commit to a file is proof drift, not the ranked-record supersession StaleBench measures. Git history is not a ranked store and `recallLessons` is unranked, so a fixture would pass for the wrong reason. What is proven: `stale-anchor` fails a triggered row whose Falsifier or enforcing gate changed after the proof. What is not: that a superseded evidence record invalidates an otherwise green lesson. Grounded in StaleBench (ACL ARR 2026 August, OpenReview `1zCrxCUNtW`, unverified preprint), whose lower-rank mechanism stays unobservable here. Residual: KRN has no ranked retrieval consumer; reopen only when a ranked store and a historical-query consumer exist, with a real pairwise supersession fixture. |

| LT-5 | The content-vs-enforcement memory effect survives a neutral stratum, repeats, and a third model family. | Registered 2026-09-13. Eight frozen tasks in two strata (four decisive where a lesson applies implicitly, four neutral tasks of equal shape where none does), three arms (A ablation, B content, C forced reconstruction), three repeats for B/C and one for A, a third disjoint family (opencode-go/glm-5.3) on all arms, and a single blinded decider (opencode-go/qwen3.8-max) disjoint from every producer over anonymized left/right-randomized packets. Explicit bwrap binds only (no host-root bind), fixture and answer key outside every bind, held-out check copied in only after the agent exits, per-run sentinel. | Held-out pass by arm and stratum, wall time, tokens in/out, diff size, decider score, sentinel leak, host-root exposure. | Content is generic priming, not memory: pass(B)-pass(A) on decisive tasks does not exceed pass(B)-pass(A) on neutral tasks plus 0.25. Promotion kill: sentinel leak, host-root or answer-key read, or held-out reachability during execution. | lab-test | Protocol registered and isolation dry-run validated 2026-09-13, no task run yet. Non-proofs: no result; arms and strata are designed but no run has produced evidence, so no mechanism is promoted on this row. Dry-run findings: `opencode --version` runs under explicit binds only with `/run` and `/sys` bound (omitting `/run` gives an API connect error), a fresh share dir without an auth seed fails (`UnknownError`), and with those fixed a one-prompt run exited 0 with token usage captured from `events.jsonl` (9,427 in / 2 out) while a `$HOME` canary and `/mnt` stayed invisible. Seed only the auth file into the isolated share, never the whole 31 GB host share. |

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-4` is retired (its lower-rank mechanism needs a ranked store KRN forbids); the shipped proof-drift surrogate is `stale-anchor`; `LT-1` and `LT-2` are blinded
pilots that must run before the memory harness or cross-repo transfer is
described as effective rather than defensive; the `LT-1` content-vs-enforcement
question is reopened by the registered `LT-5` scale-up, which has no result yet.
