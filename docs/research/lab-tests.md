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
| LT-3 | The change-contract gate blocks self-authored, redefined, and unmet checks before publication. | Deterministic: a self-authored/unmet lane vs the satisfied lane (a changed, pre-existing check). | The gate blocks a check introduced or redefined in the range and an unmet prediction, and passes the satisfied lane. | A self-authored or redefined check passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It does not block a change paired with an unrelated pre-existing green check: the before-state is declared, not executed, so a determined author can still pair a change with an unrelated green check. That residual is recorded in `orchestration.md`. The frozen observer compares TAP case names, so a same-name replacement that weakens the body can still mask a dropped assertion. It also does not follow a declared script's imports, so a changed `test/**` file reached through an unchanged launcher is not flagged as self-authorized. |
| LT-4 | A lesson whose evidence record was superseded is stale even when its own gate still passes, so recall should re-resolve the anchor against current records. | Deterministic differential. Control: a lesson whose referenced record is current. Treatment: a byte-identical lesson row whose referenced record was superseded, differing only by a marker-free supersession link. | The treatment lane is blocked or flagged while the control lane stays green. | The lanes are indistinguishable, or the control blocks. | retired | Retired 2026-09-12 without a differential. The proposed rule (Evidence cell names a path whose `git log <Falsifier-sha>..HEAD -- <path>` is non-empty, fired only for triggered rows) is rejected: Evidence is free prose naming symbols, module basenames, commits, and error strings, not owned paths, so parsing is inert or coincidental; only one row carries a Trigger, so fail-closed coverage is ~1; parsed Evidence paths nearly always coincide with the already-resolved enforcing gate, duplicating `stale-anchor`; and a later commit to a file is proof drift, not the ranked-record supersession StaleBench measures. Git history is not a ranked store and `recallLessons` is unranked, so a fixture would pass for the wrong reason. What is proven: `stale-anchor` fails a triggered row whose Falsifier or enforcing gate changed after the proof. What is not: that a superseded evidence record invalidates an otherwise green lesson. Grounded in StaleBench (ACL ARR 2026 August, OpenReview `1zCrxCUNtW`, unverified preprint), whose lower-rank mechanism stays unobservable here. Residual: KRN has no ranked retrieval consumer; reopen only when a ranked store and a historical-query consumer exist, with a real pairwise supersession fixture. |

| LT-5 | The content-vs-enforcement memory effect survives a neutral stratum, repeats, and a third model family. | Registered 2026-09-13. Start with a one-decisive plus one-neutral separation gate (six runs) before scaling to eight frozen tasks in two strata (decisive where a lesson applies implicitly, neutral of equal shape where none does), three arms (A ablation, B content, C forced reconstruction), at least three reps for A as well as B/C to estimate variance and a minimum detectable effect, and a length-matched irrelevant (placebo) row as an arm-B control. A third family (opencode-go/glm-5.3) runs all arms, but it shares a provider/SDK with the decider, so decider independence is a stated non-proof; the single blinded decider sees anonymized, left/right-randomized, trailer-stripped packets. Explicit bwrap binds only, fixture and answer key outside every bind with a committed salted hash manifest for retention, held-out check copied in only after the agent exits, per-run sentinel; host-root exposure is defined as access to `/` or host `$HOME` outside the declared binds. bwrap must be >= 0.12.0 (CVE-2026-87766, GHSA-pxhw-h44j-8pfx: setup-time creation follows a parent symlink onto /oldroot and writes on the host outside every bind); the pre-run assertion must check `bwrap --version` and run a setup-write probe, and the 0.11.2 host is a stated confound. The MDE must come from the paired-binary required-N (McNemar) with a cluster design effect over the 8 tasks and 2 strata; three reps are repeated measures. `/run` exposes only name resolution (a static resolv.conf or the resolved subpath) with a private `/run/user`, and a pre-run probe must show `busctl --user` and `flatpak-spawn --host` fail inside the sandbox. Arm C runs the harness read-only via --root with a git shim that fires only on `unreconstructed-recall` and holds the change-contract obligation constant across B/C, so a C effect is attributable to recall enforcement. A mechanical pre-run assertion requires `memory recall` to return zero hits for every neutral changed path, and arm A's neutral pass rate strictly between 0 and 1. | Held-out pass by arm and stratum, wall time, tokens in/out, delivered context (not nominal budget; arXiv:2608.31057), diff size, decider score, sentinel leak, host-root exposure. | Content is generic priming, not memory: the decisive difference-in-differences over the neutral stratum does not clear the estimated minimum detectable effect (not a fixed 0.25). Enforcement is unattributable if pass(C) beats pass(B) only with material extra cost or if the shim fires on a neutral task. Promotion kill: sentinel leak, declared host-root or answer-key read, held-out reachability during execution, or a neutral path that matches a trigger. | lab-test | Protocol registered 2026-09-13; isolation dry-run validated and the separation gate was run (N=3, a content effect but non-promoting; see below). Non-proofs: no result; arms and strata are designed but no run has produced evidence, so no mechanism is promoted on this row. The codex lane is not hermetic here (npx/mise wrapper) and is a stated non-proof unless pinned by hash; the decider shares a provider with the third family; and a definitional ablation without a placebo cannot separate content from added context on its own. Dry-run findings: `opencode --version` runs under explicit binds only with `/run` and `/sys` bound (omitting `/run` gives an API connect error), a fresh share dir without an auth seed fails (`UnknownError`), and with those fixed a one-prompt run exited 0 with token usage captured from `events.jsonl` (9,427 in / 2 out) while a `$HOME` canary and `/mnt` stayed invisible. Seed only the auth file into the isolated share, never the whole 31 GB host share. The dry-run used the host's 0.11.2; a locally built 0.12.0 is now staged and probe-validated, so the dry-run alone still does not evidence isolation. |

## LT-5 design additions (2026-09-13)

Registered before any LT-5 run, from a fresh-source review of the measurement
design:

- The three arms and two strata are a family of contrasts, so report
  Holm-adjusted significance (or one mixed model with task/stratum random
  effects) rather than unadjusted pairwise McNemar (arXiv:2607.25589).
- The blinded decider scores each packet once; report verdict flips and
  majority aggregation over N=11 repetitions, because single-pass judge
  verdicts flip within items (arXiv:2606.13685).
- Build placebo and neutral rows by deterministic perturbation of a held-out
  gold answer and add a gold-to-negative string-equality oracle, so item
  integrity is mechanically checkable in addition to the salted hash manifest
  (arXiv:2607.13707).

- Report resource and transient failures (OOM, preemption, provider
  `UnknownError`) as a per-arm infra-error metric separate from task failure,
  stagger the reps across times/days, and record the sandbox's guaranteed
  allocation and a separate hard-kill threshold (not one multiplier), so the
  paired contrast counts only agent-caused failures (arXiv:2602.07150).
- Before scaling, decompose the separation-gate paired variance into prediction
  and data components and allocate the budget to reps vs tasks by whichever
  dominates, rather than fixing 8 tasks and treating reps as mere repeats
  (arXiv:2512.21326).
- Start every cell from a fresh, history-free tree (git-init single commit or a
  git-stripped copy) and record the commit count seen at agent start, because a
  workspace `.git` can leak a prior cell's lesson or answer to an ablation arm
  (Anthropic, demystifying evals for AI agents, 2026-01-09).

Falsifiers: re-run each contrast both ways; if significance is identical under
unadjusted McNemar and under Holm, the adjustment is unnecessary. Score one
packet set once and 11 times; if single-pass matches the majority at >=95% and
the within-item flip rate is <5%, repetition is unnecessary. If every placebo
item is string-distinguishable from its gold, the oracle changes nothing.
Repeat one cell on the pinned resource config at three times; if the per-arm
infra-error rate is 0 and the success count is identical, the infra factor is
inert. Run two consecutive same-condition cells in one tree; if the second
arm-A pass count does not exceed the first, the history scrub is unnecessary.
Run one cell at the allocation floor and at the kill ceiling; if the infra-error
rate is 0 and the success count is identical, the resource pair is inert.
Decompose the gate's paired variance; if data noise dominates prediction noise,
rep-averaging cannot raise power and the reallocation is unnecessary.

- bwrap floor is now available: 0.12.0 built from the official tag tarball (meson and
  ninja in a venv, libcap 2.78) and staged outside the repo; it passes a functional probe
  (`/mnt` and `$HOME` hidden) and the GHSA-pxhw-h44j-8pfx setup-write probe (fails closed,
  no host write). The system bwrap stays 0.11.2, so a run must use the staged 0.12.0.

## LT-5 separation gate (2026-09-13)

One decisive plus one neutral task, arms A (lesson row removed), B (lesson
content), C (forced recall via the harness CLI), three runs per cell, under the
staged bwrap 0.12.0 with a fresh share seeded only with `auth.json` and the host
`opencode.db` never copied. The harness is copied inside the working tree so the
agent needs no external-directory permission. Fixture: a banner string coupled to
`BANNER_VERSION`; the decisive lesson's `path:src/greeting.mjs` trigger matched
(1 hit) and the neutral `README.md` path matched none (0 hits). Held-out check
copied in only after the agent exited; pre-run isolation probes showed `/mnt` and
`$HOME` hidden and `node` available.

| Cell | decisive | neutral | median wall (s) | median tokens in/out |
|---|---|---|---|---|
| A (ablate) | 0/3 | 3/3 | 16 / 14 | 10876 / 8914 |
| B (content) | 2/3 | 3/3 | 17 / 16 | 10384 / 10149 |
| C (forced recall) | 3/3 | 3/3 | 20 / 14 | 11481 / 9398 |

Disposition: **content effect present, still non-promoting.** Content (B) beats
ablation (A) on the decisive task (2/3 vs 0/3); the arms differ only by the
lesson row, so delivering the coupled-version lesson changed the outcome. Forced
recall (C) is at ceiling (3/3) and does not beat content at this N, and cost does
not separate them. The neutral stratum is at ceiling for every arm (3/3), so it
provides no contrast and the registered difference-in-differences cannot separate
the content effect from generic priming; N=3 is below the registered MDE; and the
placebo arm and the exact git-shim `--strict-recall` mechanism (C is a
CLI-forced proxy) are not yet run. No mechanism is promoted on this gate. Reopen
with a neutral task that has variance, the length-matched placebo, the registered
tasks x reps, and the exact git-shim mechanism.

Confounds recorded honestly: an earlier pass was confounded by an
external-directory permission rejection when the harness lived outside the working
tree (arm B no-op), and an intermediate pass aborted on transient provider
`UnknownError`s; both were fixed for the final run (harness copied inside `/work`,
retry on transient errors). The final dataset has zero retries and zero provider
errors.

Retention manifest (salt `46bd785538ad43e1`, first 16 hex of
sha256(salt || file)): `greeting.mjs=eaa6f61223c4be17`,
`version.mjs=84e8e430b910d5d3`, `workflow-lessons.md=5398bfff51bf429f`,
`heldout-decisive.test.mjs=929bd21846386888`,
`heldout-neutral.test.mjs=00c7c0c97cdf1c67`. Residuals: the fixtures and answer
keys are staged outside the repo (in the lab dir, not committed here), so the
manifest verifies only a retained copy; arm C's forced-reconstruction prompt is a
proxy for the registered git-shim `--strict-recall` path, not that exact
mechanism; the neutral stratum is at ceiling and uninformative; and the runs are
one model family with N=3.

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-4` is retired (its lower-rank mechanism needs a ranked store KRN forbids); the shipped proof-drift surrogate is `stale-anchor`; `LT-1` and `LT-2` are blinded
pilots that must run before the memory harness or cross-repo transfer is
described as effective rather than defensive; the `LT-1` content-vs-enforcement
question is probed by the `LT-5` gate: content beats ablation on the decisive task (2/3 vs 0/3) while the neutral stratum is at ceiling, so no mechanism is promoted yet.
