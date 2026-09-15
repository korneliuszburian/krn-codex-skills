# Lab tests

Status: `accepted`. Consumer: `$source-to-decision` and the maintainer.
Owner: maintainer. Verified: 2026-09-14. This page makes bounded, blinded pilots
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
| LT-1 | Memory delivered at the decision changes task outcomes on decisive tasks; forced reconstruction is tested against content; the neutral stratum that would separate generic priming is deferred to LT-5. | Preregistered 2026-09-12 three-arm outcome run under real isolation: arm A removes the applicable lesson (an ablation, not merely an uninformed reader); arm B adds the lesson content; arm C adds forced reconstruction. Frozen task set; evaluator inaccessible during execution; held-out check. | Held-out success, wall time, and token cost, all required (serving cost is not inferable from length; arXiv:2608.11879). | No content effect beyond a neutral stratum, or enforcement (C) beating content (B) at higher cost. | lab-test | Bounded two-family result: content delivery changes outcomes and used fewer codex tokens; enforcement is at ceiling and uninformative. bwrap-isolated run (private /tmp, fixtures outside /tmp, fresh data dirs, random per-run sentinel): 4 decisive tasks x A/B/C. opencode A 0/4 (avg 401s), B 4/4 (21s), C 4/4 (37s); codex A 0/4 (49s), B 4/4 (39s), C 4/4 (40s). Codex tokens A 47.6k, B 38.7k, C 46.2k. Decision: forced reconstruction is advisory by default (`--strict-recall` opts in). Non-proofs: the four tasks were all memory-dependent with no neutral stratum, so nonspecific priming is not separated from a memory effect; B and C both scored 4/4, so the B-vs-C question is a tie at ceiling with one rep and no variance; opencode tokens were not captured, so the cost ordering is codex-only; arm A was an ablation that removes the lesson, so a large A-to-B gap is partly definitional; and the four fixtures and answer keys were not retained, so the result is not independently reproducible. The sandbox exposed the host root read-only. Reopen with the registered LT-5 scale-up. |
| LT-2 | A second repository adopts the harness and the memory pins hold across repos. | Blinded pilot: `onboarding-demo` with the harness adopted vs its managed-block-only state. | Gates green, a lesson recorded and delivered, a proof re-run. | The harness cannot install or a lesson cannot be delivered. | lab-test | Observed twice, single repository. `onboarding-demo` (published) adopted the scaffolded memory page and gate scripts; a real lesson with a re-runnable falsifier is delivered and exercised. Second verification in a disposable worktree: a version bump without a Recall blocks with two `unreconstructed-recall` errors (`path:greet.mjs`, `symbol:VERSION`) plus `unmet-prediction`, and the reconciled commit with both Recall lines and `At-risk` for all three tests passes. Non-proofs: one repository, a simple demo fact, a per-commit gate, procedural provenance without a retained run log, and a harness CI job that skips without secrets. |
| LT-3 | The change-contract gate blocks self-authored, redefined, and unmet checks before publication. | Deterministic: a self-authored/unmet lane vs the satisfied lane (a changed, pre-existing check). | The gate blocks a check introduced or redefined in the range and an unmet prediction, and passes the satisfied lane. | A self-authored or redefined check passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It does not block a change paired with an unrelated pre-existing green check: a declared `red->green` is base-executed under `--before`, but a `green->green` obligation is not, so a determined author can still pair a change with an unrelated green check. That residual is recorded in `orchestration.md`. The frozen observer compares TAP case names, so a same-name replacement that weakens the body can still mask a dropped assertion. It also does not follow a declared script's imports, so a changed `test/**` file reached through an unchanged launcher is not flagged as self-authorized; a frozen observer declared as a newly authored test file is compared only against its own base overlay, so deleting a sibling pre-existing test file while adding a smaller one evades `observer-shrinkage`; the gate and its tests run from the head revision, so a commit that rewrites the checker is not caught by an independent base-pinned verifier; and an admitted check's echoed stdout is not stripped of control bytes. |
| LT-4 | A lesson whose evidence record was superseded is stale even when its own gate still passes, so recall should re-resolve the anchor against current records. | Deterministic differential. Control: a lesson whose referenced record is current. Treatment: a byte-identical lesson row whose referenced record was superseded, differing only by a marker-free supersession link. | The treatment lane is blocked or flagged while the control lane stays green. | The lanes are indistinguishable, or the control blocks. | retired | Retired 2026-09-12 without a differential. The proposed rule (Evidence cell names a path whose `git log <Falsifier-sha>..HEAD -- <path>` is non-empty, fired only for triggered rows) is rejected: Evidence is free prose naming symbols, module basenames, commits, and error strings, not owned paths, so parsing is inert or coincidental; only one row carries a Trigger, so fail-closed coverage is ~1; parsed Evidence paths nearly always coincide with the already-resolved enforcing gate, duplicating `stale-anchor`; and a later commit to a file is proof drift, not the ranked-record supersession StaleBench measures. Git history is not a ranked store and `recallLessons` is unranked, so a fixture would pass for the wrong reason. What is proven: `stale-anchor` fails a triggered row whose Falsifier or enforcing gate changed after the proof. What is not: that a superseded evidence record invalidates an otherwise green lesson. Grounded in StaleBench (ACL ARR 2026 August, OpenReview `1zCrxCUNtW`, unverified preprint), whose lower-rank mechanism stays unobservable here. Residual: KRN has no ranked retrieval consumer; reopen only when a ranked store and a historical-query consumer exist, with a real pairwise supersession fixture. |

| LT-5 | The content-vs-enforcement memory effect survives a neutral stratum, repeats, and a second model family. | Registered 2026-09-13. Start with a one-decisive plus one-neutral separation gate (six runs) before scaling to eight frozen tasks in two strata (decisive where a lesson applies implicitly, neutral of equal shape where none does), three arms (A ablation, B content, C forced reconstruction), at least three reps for A as well as B/C to estimate variance and a minimum detectable effect, and a length-matched irrelevant (placebo) row as an arm-B control. Families: `deepseek-v4.1-flash` (opencode transport) and `gpt-5.6-luna` (codex transport); `gpt-6-astra` is the creative escalator; `glm-5.3` and luna-via-opencode runs are quarantined. The single blinded decider sees anonymized, left/right-randomized, trailer-stripped packets. Explicit bwrap binds only, fixture and answer key outside every bind with a committed salted hash manifest for retention, held-out check copied in only after the agent exits, per-run sentinel; host-root exposure is defined as access to `/` or host `$HOME` outside the declared binds. bwrap must be >= 0.12.0 (CVE-2026-87766, GHSA-pxhw-h44j-8pfx: setup-time creation follows a parent symlink onto /oldroot and writes on the host outside every bind); the pre-run assertion must check `bwrap --version` and run a setup-write probe, and the 0.11.2 host is a stated confound. The MDE must come from the paired-binary required-N (McNemar) with a cluster design effect over the 8 tasks and 2 strata; three reps are repeated measures. `/run` exposes only name resolution (a static resolv.conf or the resolved subpath) with a private `/run/user`, and a pre-run probe must show `busctl --user` and `flatpak-spawn --host` fail inside the sandbox. Arm C runs the harness read-only via --root with a git shim that fires only on `unreconstructed-recall` and holds the change-contract obligation constant across B/C, so a C effect is attributable to recall enforcement. A mechanical pre-run assertion requires `memory recall` to return zero hits for every neutral changed path, and arm A's neutral pass rate strictly between 0 and 1. | Held-out pass by arm and stratum, wall time, tokens in/out, delivered context (not nominal budget; arXiv:2608.31057), diff size, decider score, sentinel leak, host-root exposure. | Content is generic priming, not memory: the decisive difference-in-differences over the neutral stratum does not clear the estimated minimum detectable effect (not a fixed 0.25). Enforcement is unattributable if pass(C) beats pass(B) only with material extra cost or if the shim fires on a neutral task. Promotion kill: sentinel leak, declared host-root or answer-key read, held-out reachability during execution, or a neutral path that matches a trigger. | lab-test | Protocol registered 2026-09-13; isolation dry-run validated and the separation gate was run (N=3, a content effect but non-promoting; see below). Non-proofs: the only authorized calibration (deepseek) is at ceiling with no separation power and the separation gate is N=3, so no mechanism is promoted on this row. The codex lane is not hermetic here (npx/mise wrapper) and is a stated non-proof unless pinned by hash; the decider shares a provider with the opencode family; and a definitional ablation without a placebo cannot separate content from added context on its own. Dry-run findings: `opencode --version` runs under explicit binds only with `/run` and `/sys` bound (omitting `/run` gives an API connect error), a fresh share dir without an auth seed fails (`UnknownError`), and with those fixed a one-prompt run exited 0 with token usage captured from `events.jsonl` (9,427 in / 2 out) while a `$HOME` canary and `/mnt` stayed invisible. Seed only the auth file into the isolated share, never the whole 31 GB host share. The dry-run used the host's 0.11.2; a locally built 0.12.0 is now staged and probe-validated, so the dry-run alone still does not evidence isolation. |

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

- Pin and record the agent's inference-effort setting per cell, and make the
  placebo wording-matched as well as length-matched: content can be an effort
  artifact and an intervention's value shifts with the harness and effort
  (arXiv:2608.01347).

- Report cost as provider-billed cost per successful task, decomposed into
  prompt-cache write/read versus uncached input/output, not raw token counts;
  token count and billed cost diverge when cache traffic dominates
  (arXiv:2607.12161). Restate the gate cost result as "tokens did not separate
  the arms", not "cost did not".

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
rep-averaging cannot raise power and the reallocation is unnecessary. Derive
billed cost from the usage record and compare arm ordering under tokens versus
cost; if they agree, the metric change is unnecessary. Run the decisive cell at
two effort settings and a wording-matched placebo; if pass count and
cost-per-success are identical, the effort pin is unnecessary.

- bwrap floor is now available: 0.12.0 built from the official tag tarball (meson and
  ninja in a venv, libcap 2.78) and staged outside the repo; it passes a functional probe
  (`/mnt` and `$HOME` hidden) and the GHSA-pxhw-h44j-8pfx setup-write probe (fails closed,
  no host write). The system bwrap stays 0.11.2, so a run must use the staged 0.12.0.

## Codex-transport runner (2026-09-14)

The luna family prerequisite is now built and isolation-verified. The runner lives
outside the repo at `lab/lt5/isolation-run-codex.sh` (codex transport only,
`ALLOWED_MODELS=gpt-5.6-luna`), pins `@openai/codex@0.154.0` by version and npm
integrity `sha512-FV/x1OHXYv/ifjf3mXj9ThTTAWcUZN6cGIRQRhRxkKNOPuImu1WW0c8ev1vUkE9XGH90dEnYG1tBjIkxRikg0w==`,
seeds only `auth.json` into a fresh `CODEX_HOME`, and reads `served_model=` from the
codex session rollout (fail-closed on mismatch). Isolation `probe` under staged
bwrap 0.12.0: `/mnt` hidden, host `~/.codex` hidden, writes denied, auth seeded,
uid 1000. First runs (2026-09-14, maintainer-approved): a one-call smoke returned
`codex_exit=0`, `served_model=gpt-5.6-luna`, `model_mismatch=no`, `sentinel_leak=no`.

Separation gate v1 (FAMILY=gpt-5.6-luna, SHAPES=text, REPS=1, arms A/B/P) exposed a
fixture defect, not a result: the neutral coupling (bump `RECEIPT_VERSION` with
`RECEIPT`) was only a source comment, so luna changed the value without the bump and
neutral sat at floor (A/B/P 0/1) while decisive showed A 0/1, B 1/1, P 0/1. With a
floor neutral the difference-in-differences is unidentified.

Separation gate v2 (recalibrated: the neutral template's mandated `node --test` now
carries a visible coupling test, so the bump is discoverable rather than hidden;
`results-codex-gpt-5.6-luna-v2`, REPS=3): decisive A 0/3, B 3/3, P 0/3; neutral A 3/3,
B 3/3, P 3/3. All 18 runs `served_model=gpt-5.6-luna`, `model_mismatch=no`,
`sentinel_leak=no` (the field was not yet fail-closed in `runs.txt`; the retained `.out` files post-verify 18/18 no, as do v1's 6/6); decisive tokens input ~55k-85k, output ~0.8k-1.0k. Reading: the
lesson content changes the decisive outcome and adds nothing on the neutral task
(`B-A` decis 3/3 vs neutral 0/3), and the wrong-content placebo fails decisive, so
the effect is content-specific rather than generic context. The neutral half of that
reading is superseded below: the v1/v2 neutral manipulation was byte-identical
across arms, so its `B-A = 0` was noise, not evidence.

Bound and adjustment: the registered precondition "arm A neutral strictly between 0
and 1" was replaced by a **ceiling** neutral (`B-A = 0`); a boundary control does not
identify the interaction in the usual sense — `B-A = 0` is forced by the ceiling
and `theta` collapses to the decisive `B-P` contrast, so report it as a bound. The neutral stratum has zero variance at N=3 and one task per stratum,
so no promotion and the required-N must use the decisive contrast. This gate is a
separation check, not confirmation; scaling the neutral fixtures (more shapes) and
the frozen confirmation pool remains open.

The same v2 fixtures were rerun on the authorized deepseek family
(`results-deepseek-v2`, REPS=3) for cross-family comparability: decisive A 3/3,
B 3/3, P 3/3 and neutral A/B/P 3/3 — deepseek is at ceiling on both strata, so it has
no separation power on this task, exactly the authorized-calibration ceiling already
recorded. Reading across families: on the decisive text task luna fails without the
lesson and passes with it (`B-A = 3/3`) while deepseek passes either way, so the
content effect is real but family-dependent and only observable where the base model
lacks the knowledge. Neither family promotes: the neutral contrast is 0 for both, the
luna neutral has zero variance at N=3, and one task per stratum is a separation probe,
not a frozen confirmation.

### Frozen multi-shape replication v3 (2026-09-14, `results-codex-gpt-5.6-luna-v3`)

Fixture-integrity repair before the run: in v1/v2 the neutral templates carried an empty lesson table, so the A (row removed) / B (kept) / P (placebo) manipulation was a no-op there and the neutral A/B/P files were byte-identical — the neutral contrast was pure noise. `setup-tasks.sh` now writes a shape-matched, task-irrelevant row (a changelog/release coupling with trigger `path:CHANGELOG.md`, never matching the changed src path) for every neutral, and the earlier disclosed-coupling visible test is removed, so all four neutrals are consistent and the arm manipulation is a real file change in both strata.

`check-tasks.sh` (new) is the fixture falsifier, 8/8: the gold patch passes every held-out; the requested-change-only patch passes the visible `node --test` but fails the held-out coupling; decisive recall is 1 and neutral recall 0; and the staged A/B/P lesson files differ in both strata. Frozen identity: salt `fe3deb2f82f07d4a`, tree ROOT `fbdfe527c50aadcd` over 80 files (`manifest-tasks.sh`); the run used `gate-tasks-codex.sh` sha256 `bce485565ffa264a07fadc11b0b534651a0bfda123e3518ae80c87185e74a269` and `isolation-run-codex.sh` sha256 `6074a3e61260d102f60c3896eade56272d150cc4b282ae4189caf08d406132d5` (the gate was edited afterwards to record the sentinel; the exact frozen copy is retained in the lab, not the repo).

Result (gpt-5.6-luna via codex, 4 shapes × 2 strata × A/B/P × 3 reps = 72 executions, zero retries): decisive A 0/12, B 12/12, P 0/12; neutral A/B/P 0/12; `theta = 1.000`. All 72 `served_model=gpt-5.6-luna`, `model_mismatch=no`; `sentinel_leak=no` in all 72 `.out` files.

Self-found gate defect fixed here: `gate-tasks*.sh` ran a `sentinel_leak=YES` promotion-kill but never wrote `sentinel_leak=` into `runs.txt`, so the check was vacuous (it passed on any output). Both scripts now extract and record `sentinel_leak=`, and the kill fails closed on `YES` or on a missing field; re-freeze the scripts before any future run. The luna v3 sentinel is verified post-hoc from the 72 `.out` files.

Bound and non-promotion: the neutral is degenerate at the floor (no arm passes), so `theta` is identified by construction rather than by an informative control and the registered interior arm-A rate is still unmet; the four shapes are structure-matched (constant plus revision constant), not mechanism-independent; and this is one family at N=3 with no frozen power analysis. No promotion; mechanism-independent fixtures (PRD 0003) and the power simulation (PRD 0002) remain the prerequisites before a confirmation.

### Cross-family check v3 and an infra-failure gate fix (2026-09-14, `results-deepseek-v3`)

The same frozen set on `deepseek-v4.1-flash` (opencode transport): decisive A/B/P 1.0 and neutral A/B/P 1.0 (route/neutral A 0.5 over its two non-infra cells), so `theta = 0.000` — deepseek is at ceiling on every shape and has no separation power on this task set, matching the authorized-calibration ceiling already recorded. Cross-reading: on the same frozen objects luna fails decisive without the lesson and passes with it (`B-P = 1`) while deepseek passes either way, so the content effect is family-dependent and only observable where the base model lacks the knowledge.

The deepseek run is weaker evidence than it looks: 11 of 72 executions (15%) exhausted three retries on transient opencode `UnknownError`s (`opencode_exit=1`, no served model) and were being counted as task failures. The aggregator now classifies such a cell as INFRA and excludes it from the denominator, and both gate scripts now abort fail-closed when the agent did not run or the served model is unrecorded. The luna v3 run had zero retries, so its result is unaffected.

Design bounds recorded from the fresh-source and lab-test-design reviews: the neutral arm manipulation changes the lesson file but not the delivered context (every neutral arm recalls zero applicable rows, because the irrelevant row's trigger never matches the edited path), so `B-P|neutral = 0` by non-delivery and `theta` collapses to the decisive contrast; the decisive trigger is exactly the file the agent edits (`path:src/greeting.mjs`), so retrieval fires at the edit point and the recalled row states the fix, meaning the contrast partly measures edit-point hinting rather than prospective recall; the boundary estimate has no finite normal-approximation CI (zero discordant pairs), so report the exact paired bound instead (`0.025^(1/12) ~= 0.735` lower for the decisive `B-P`, hence `theta >= ~0.735` as a bound); arm C is omitted here, so the enforcement half of the LT-5 claim is untested; and the second authorized family sits at ceiling, so it is a ceiling check, not a second-family replication. The salted manifest is retained in the lab directory (outside the repo) per the raw-fixtures-outside rule; this page commits the salt and ROOT only.

### Mechanism-distinct fixtures v4 (2026-09-14, `tasks-v4`)

PRD 0003's prerequisite: the v1–v3 shapes are one mechanism (a scalar value plus a revision scalar) renamed, so a `theta` that generalized across them would still be label generalization. `setup-tasks-v4.sh` (new) authors four mechanism-distinct couplings over the same four shape/stratum directory names, so `gate-tasks*.sh` is unchanged: a scalar revision counter (text), a bidirectional schema-membership validator (key), a route↔registration dispatcher (route), and a content digest (media). Each decisive variant carries a triggering lesson row and each neutral an irrelevant `CHANGELOG` row; every task has one main file, one companion file, the same visible-test shape, and the same prompt structure.

`check-tasks-v4.sh` (new) is the falsifier, 8/8: for each task the requested-change-only patch passes the visible `node --test` but fails the held-out coupling, the gold patch passes, the A/B/P arm files differ in both strata, and hits are decisive 1 / neutral 0. The held-out failure classes are mechanism-distinct and reproduced directly: `AssertionError` strictEqual (revision), `AssertionError` falsy (validator rejection), `Error: unregistered route` (dispatch), and `Error: digest mismatch` (checksum). Frozen identity: salt `78a3390fc11d42c2`, ROOT `875de01f6e4dbd56` over 80 files. Not yet run: v4 replaces the structure-matched set for the next calibration and needs a fresh luna/deepseek run before any `theta` is read across mechanisms; the v3 result above remains the recorded separation evidence.

## LT-5 separation gate (2026-09-13)

One decisive plus one neutral task, arms A (lesson row removed), B (real
coupled-version lesson), P (placebo: same trigger and shape, task-irrelevant
footer coupling), C (forced recall via the harness CLI), three runs per cell,
under the staged bwrap 0.12.0 with a fresh share seeded only with `auth.json` and
the host `opencode.db` never copied. The runner asserts `bwrap --version >=
0.12.0`, copies the harness inside `/work` (no external-directory permission),
binds a private `/run/user` (host session D-Bus hidden), unsets
`DBUS_SESSION_BUS_ADDRESS`/`XDG_RUNTIME_DIR`, records a per-run sentinel, runs a
mandatory isolation preflight under the exact binds, shuffles arm order, and
records the model. Fixture: the decisive task couples a banner string to
`BANNER_VERSION` with lesson trigger `path:src/greeting.mjs` (1 hit); the neutral
is a same-shape two-file coupling (`SALUTATION` + `SALUTATION_VERSION`, coupling
stated in ordinary source docs, no lesson trigger, 0 hits on `src/salutation.mjs`).
The in-repo tests read the current constant and require version `>= 1`, so an arm
can attempt the change and fail only the coupling. Held-out checks are copied in
only after the agent exits.

| Cell | decisive | neutral | median wall decisive/neutral (s) | median total tokens decisive/neutral |
|---|---|---|---|---|
| A (ablate) | 0/3 | 2/3 | 27 / 32 | 31514 / 14521 |
| B (content) | 3/3 | 3/3 | 14 / 22 | 10561 / 15846 |
| P (placebo) | 0/3 | 3/3 | 71 / 31 | 49161 / 15539 |
| C (forced recall) | 3/3 | 3/3 | 15 / 18 | 10824 / 10330 |

Out-of-scope family run, retained for the record only (2026-09-13,
`opencode-go/glm-5.3`, an unauthorized family, arms A/B/P, same fixture and one
decisive plus one neutral task, three runs per cell): decisive
A 0/3, B 3/3, P 0/3; neutral A 0/3, B 2/3, P 1/3. These counts are retained as
history only and carry no evidentiary conclusion: `glm-5.3` is not an authorized
family, so the run is neither a family replication nor promotion evidence and is
excluded from every family/interaction reading. Do not cite these numbers.

Disposition: **content effect attributable to the lesson's content, still
non-promoting.** The arms differ only by the lesson row. In all three decisive A
runs the agent changed `BANNER` to `Welcome` and left `BANNER_VERSION` at 1,
failing the held-out coupling on the version assertion alone; B and C bumped it
and passed 3/3. The placebo P also failed 0/3: with the same trigger, shape, and
length but task-irrelevant footer content the agent made no source change in any
run, so only the correct coupled-version content produced success. The neutral now
has interior variance (A 2/3: one run changed `SALUTATION` and left
`SALUTATION_VERSION` at 1), so the difference-in-differences is partially
identified: `(B−A)_decisive − (B−A)_neutral = 1.0 − 0.333`. Still not promoted:
N=3 is below the registered MDE; one model family at one effort; the neutral is one
task; and C is a CLI-forced proxy for the git-shim `--strict-recall` mechanism, not
that mechanism.

Placebo P was then repaired to a true, already-satisfied convention (the footer
already ends in a trailing newline; no panel threatens the task). On a fresh
one-rep calibration (REPS=1, separate `results-smoke`) the repaired P still failed
the decisive held-out: it changed `BANNER` to `Welcome` and left
`BANNER_VERSION` at 1, exactly like arm A, so P again added nothing task-relevant.
That is a calibration signal, not a powered dataset (N=1, different context), so
the registered N=3 dataset above is kept as recorded and P is not called neutral
until it is run in the powered design.

Open controls after the round-54 review and this run. Done: the same-shape neutral
fixture with an interior arm-A rate; a same-trigger/same-shape placebo arm repaired
to a non-confusing, already-satisfied convention. Still
open, each with a falsifier: (1) a length- and token-matched placebo confirmed
neutral in a powered design, with a decisive-specific B−P advantage; (2)
preregistered power for the difference-in-differences itself, inflating for task
clustering `1+(r−1)ρ` (illustrative `p10=.375/p01=.125`, δ=.25, q=.50 reaches 80%
only near 85 independent pairs at α=.05/3); (3) the exact git-shim C mechanism with
B/C parity (identical prompt, recall content, access, and timing, corpus outside
agent-readable binds) showing an unreconstructed decisive commit clears B's
boundary and fails C's, reconstruction clears C, and a neutral commit never
triggers it.

Round-64 lab-test-design plan, registered before execution. Replace the two pilot
tasks with four independently authored tasks per stratum sharing one of four
matched coupling shapes (output text → revision, serialized key → schema entry,
route → registered target, media type → accepted type); decisive dependencies live
in the lesson, neutral dependencies in ordinary source documentation with zero
lesson triggers; hold file count, dependency depth, two-scalar-edit patch size,
prompt structure, doc placement, and visible-test strength constant; author the
contracts and gold patches first and freeze before observing outcomes. Primary
estimand `θ = mean(B−P | decisive) − mean(B−P | neutral)` on paired binary held-out
outcomes, averaged within tasks and estimated with task-clustered small-sample
inference; B−A stays secondary; family is fixed and a task repeated across families
keeps its cluster; a logistic interaction coefficient alone does not estimate this
probability-scale effect. Run 8 tasks × 3 arms (drop C, whose prompt does not
isolate the git-shim mechanism) × 3 reps × 2 existing families, randomized within
task/family/rep blocks rather than consecutive arm batches. N is not yet fixed:
the planning example (one family, α=.05, 80%, θ=.25, q≤.50, ICC=.20, DE=1.4) gives
~88 B/P pairs per stratum (~29 tasks per stratum, ~522 executions per family) from
the formula used at line 350; the earlier ~126/~59/~1,062 was not reproducible from
these parameters (126 needs q≈0.72 and applied the design effect twice), conditional not established; use the eight-task calibration plus conservative
ICC/discordance sensitivity to simulate the analysis and freeze N. Falsifier for
each authored item: its gold patch passes, a requested-change-only patch fails
solely on the coupled value, and neutral recall returns zero hits; reject a
proposed N unless simulation shows ≥80% power at the registered effect and ≤5%
null rejection across the declared nuisance bounds; in the frozen run a CI spanning
zero leaves the interaction unconfirmed and an upper bound below .25 rules out the
registered effect. The placebo's trailing-newline convention is now real and
mechanically enforced: `src/edition.mjs` `footer()` returns `` `${FOOTER}\n` `` and
`test/edition.test.mjs` asserts `endsWith("\n")`, so the P row's claim holds and
the visible test would fail if the convention broke.

Multi-task fixtures are now generated: `setup-tasks.sh` builds four matched
coupling shapes (text→revision, key→schema, route→registration, media→type), each
with a decisive variant (lesson trigger on the changed `src` path, 1 recall hit)
and a neutral variant (coupling only in ordinary source docs, 0 hits), all with one
main file plus one version file, the same visible-test shape, and the same prompt
structure. `gate-tasks.sh` runs A/B/P over them with per-task-scoped preflight
(asserting decisive ≥1 and neutral = 0 hits), shuffled arms, family-scoped
results, and the isolation probe; a gold patch passes every held-out and a
requested-change-only patch fails only the coupling.

Pre-results registration for the multi-task runs (2026-09-14, before reading any
powered result): the four-shape fixtures are **structure-matched, not
mechanism-independent** — each shape is the same "constant plus revision constant"
coupling with different names and topics, so a theta that generalized across
shapes would still not generalize across coupling mechanisms; making the four
shapes genuinely distinct executable contracts (serialization, routing, media
membership) is the next fixture task. A second fixture confound was found and
fixed after the calibration launch: the neutral templates also carried a coupling
lesson row (non-matching trigger, but naming the neutral variable), so a neutral
B run could be handed the coupling by the page; neutral templates now carry no
coupling row and document the coupling only in the task source, while decisive
templates keep the triggering row. The running calibration used the contaminated
neutral fixtures, so its neutral B/P cells are not clean; the fix applies to the
confirmation run. That first calibration was also aborted: `gate-tasks.sh` was
edited while the deepseek run was executing, and bash reads a script by byte
offset, so the live run hit a syntax error at the aggregate step (glm 68/72,
deepseek 72/72 executions, no aggregate). Both families were rerun from scratch
(`results-calib2-*`) on the fixed fixtures with the frozen script; the aborted
pass is retained as `results-calib1-*`. Rule learned and applied: freeze a runner
script before launching it, and never edit it mid-run. The multi-task runs (4 tasks
× 2 strata × 3 arms × 3 reps) are declared **calibration**, not confirmation: N is
unresolved (no power/type-I simulation), and they were launched with consecutive
arm batches before the gate fix. `gate-tasks` now re-permutes arms inside every
repetition block for future runs. Before any confirmation run, preregister the
designation (calibration vs frozen confirmation), the final N and stopping rule,
and the simulated ≥80% power / ≤5% null-rejection evidence, using only an
authorized family.

Second multi-task calibration (2026-09-14, fixed neutral fixtures, frozen
`gate-tasks.sh` re-permuting arms per repetition block, four tasks × two strata ×
A/B/P × three reps, `results-calib2-*`): on the **authorized** family
`deepseek-v4.1-flash`, decisive A 11/12, B 12/12, P 12/12; neutral A 12/12, B
10/12, P 10/12 — i.e. at ceiling on both strata, so it has no separation power on
this task set. The same batch also ran an **unauthorized** `glm-5.3` arm
(decisive A 3/12, B 12/12, P 4/12; neutral A 6/12, B 2/12, P 6/12); that arm is
quarantined and does not count as a family replication or as evidence, because
`glm-5.3` is not an authorized model for this work. Served-model verification:
each run's own `share/opencode/log/opencode.log` records `providerID=<p>
modelID=<m>`; the runner now extracts it, prints `served_model=`, fails closed as
`model_mismatch=YES` on a mismatch, and `gate-tasks` kills a batch not proven all
`model_mismatch=no`. Still calibration, not confirmation: N is unfrozen, the shapes
are structure-matched, and the neutral stratum needs a larger sample. (`gpt-6-astra`
is reserved for the single creative escalation, not a lab family.)

The family/transport rule above is prose in this page and was made executable by
`scripts/lib/evaluation/lt5-admissibility.mjs`; that instrument was retired (no
consumer) and the rule now lives here only; `docs/prd/0002`/`0003` are the LT-5
design briefs, so re-implement the instrument together with the aggregator when
the lab runs (the PRDs do not restate this rule).

Quarantined wrong-transport run (2026-09-14, `opencode-go/gpt-5.6-luna` **via the
opencode runner**, which is not the authorized transport for luna): four tasks ×
two strata × A/B/P × three reps, `results-luna`, all 72 runs
`served_model=gpt-5.6-luna`, `model_mismatch=no`, zero sentinel leaks; decisive
A 0/12, B 11/12, P 0/12; neutral A 0/12, B 1/12, P 2/12. Retained as raw history
only — luna must be driven through `codex exec`, so this run is not a family
replication or promotion evidence, and no behavioral claim is drawn from it. A
luna family must be run through a codex-transport runner before it counts.

Earlier multi-task pilot (2026-09-14, unauthorized `opencode-go/glm-5.3`, A/B/P,
`REPS=1`, four tasks per stratum): decisive A 1/4, B 4/4, P 2/4; neutral A 3/4,
B 4/4, P 2/4. Retained as raw history only: because the family is unauthorized and
the run predates the fixture and runner fixes, **no** behavioral or fixture-quality
claim is drawn from these counts.

Confirmation preregistration (registered 2026-09-14, before any confirmation run).
Designation: a frozen, single-family confirmation in an authorized transport; the
opencode transport may carry only deepseek, and gpt-5.6-luna must run through
`codex exec`, so the luna transport runner and a pinned codex package (version +
hash) are prerequisites. Primary estimand `theta = E[B-P | decisive] - E[B-P |
neutral]` on paired binary held-out outcomes, paired within task/repetition blocks,
averaged within tasks with equal task weights, and a two-sided 95% CI under
task-clustered small-sample inference; B-A is secondary and C is omitted; arms are
randomized within every block. Conditional planning N for `theta*=0.25`, alpha=.05,
80% power, three reps, ICC<=.20 (DE=1.4), and illustrative discordances
`q_D=0.5`, `q_N=0.25` chosen only to exercise the formula — they are not derived
from any run (the only authorized calibration, deepseek, is at ceiling, so it yields
`q_D=0` and no finite N). With `q_D=0.5`, `q_N=0.25` the formula gives about
`(1.96+0.842)^2*(0.5+0.25)/0.25^2*1.4 ~= 132` pairs per stratum, i.e. about 44
tasks per stratum with three reps (~792 A/B/P executions); this is a planning
candidate, not established power, and the final N is frozen only after a
simulation shows >=80% power and <=5% null rejection across the declared
discordance/ICC bounds. Stopping: complete the frozen N with no efficacy peeking or
outcome-dependent expansion; abort on any isolation, trigger, or served-model
violation. Decision: a CI lower bound above 0 confirms a positive interaction, above
0.25 establishes the target effect, an upper bound below 0.25 kills the registered
effect size, and a CI spanning zero leaves positivity unconfirmed. Preconditions
before confirmation: mechanism-independent fixtures (not renamed
constant/revision pairs), gold-pass plus requested-change-only-fail checks,
uncontaminated neutral source docs with zero recall hits, an independently
calibrated neutral with an interior arm-A rate, and a length/token-matched
non-harmful placebo; until then the claim is only "correct versus wrong content",
not a memory effect.

Confounds fixed across the LT-5 passes, recorded honestly: the first pass required
an external-directory permission for `/harness`, so arms no-op'd; a second aborted
on transient provider `UnknownError`s; the original in-repo test pinned the old
banner/version so arm A could not attempt the change; and the first placebo was
constructed after the run. The runner now asserts the bwrap floor, keeps the
harness in `/work`, retries transient provider errors, no longer pins the target
value, enforces a mandatory isolation preflight, and kills the run on a sentinel
leak or trigger mismatch. Final dataset: zero retries, zero provider errors,
`sentinel_leak=no`; the placebo P's adverse no-op is a recorded property, not a
confound to remove.

Retention manifest (salt `46bd785538ad43e1`, first 16 hex of
sha256(salt || file)): `greeting.mjs=eaa6f61223c4be17`,
`version.mjs=84e8e430b910d5d3`, `workflow-lessons.md=5398bfff51bf429f`,
`heldout-decisive.test.mjs=929bd21846386888`,
`heldout-neutral.test.mjs=bae8578bb295cd66`,
`salutation.mjs=d8568706aaf07f98`,
`salutation-version.mjs=12704b3cb7844392`, `placebo-row.txt=f612d5c7217dd0e6`.
Residuals: the fixtures and answer keys are staged outside the repo (in the lab
dir, not committed here), so the manifest verifies only a retained copy; arm C's
forced-reconstruction prompt is a proxy for the registered git-shim
`--strict-recall` path, not that exact mechanism; the placebo is wrong-content
rather than neutral; the neutral is one task with an interior but possibly
task-specific arm-A rate; and the runs are one model family with N=3.

## Retired measurement tooling

The evaluation instruments (`blind-mutations`, `cost-paired`, `lt1-fixtures`,
`lt5-admissibility`, `lt5-fixtures`, `lt5-power`) had no runtime or dev-gate
consumer, so they were retired to cut mass while keeping the guarantee. Their
designs remain as specs in `docs/prd/0001`–`0005`; re-implement them behind a
named lab consumer, not ahead of it, and treat the recorded booleans as design
intent rather than verified evidence.

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-4` is retired (its lower-rank mechanism needs a ranked store KRN forbids); the shipped proof-drift surrogate is `stale-anchor`; `LT-1` and `LT-2` are blinded
pilots that must run before the memory harness or cross-repo transfer is
described as effective rather than defensive; the `LT-1` content-vs-enforcement
question is probed by the `LT-5` gate: on the frozen luna v3 set every decisive shape separates (A 0/12, B 12/12, P 0/12) and the neutral is degenerate at the floor, giving a boundary estimate `theta = 1.000` with an exact paired 95% lower bound near 0.74; no mechanism is promoted (degenerate neutral, structure-matched shapes, unfrozen N on one family).
