# Lab tests

Status: `accepted`. Consumer: `$source-to-decision` and the maintainer.
Owner: maintainer. Verified: 2026-09-16. This page makes bounded, blinded pilots
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
| LT-3 | The change-contract gate blocks self-authored, redefined, and unmet checks before publication. | Deterministic: a self-authored/unmet lane vs the satisfied lane (a changed, pre-existing check). | The gate blocks a check introduced or redefined in the range and an unmet prediction, and passes the satisfied lane. | A self-authored or redefined check passes the gate. | lab-test | Run as a deterministic check, not a human pilot. It does not block a change paired with an unrelated pre-existing green check: a declared `red->green` is base-executed under `--before`, but a `green->green` obligation is not, so a determined author can still pair a change with an unrelated green check. That residual is recorded in `orchestration.md`. The frozen observer compares TAP case names, so a same-name replacement that weakens the body can still mask a dropped assertion. It also does not follow a declared script's imports, so a changed `test/**` file reached through an unchanged launcher is not flagged as self-authorized; a frozen observer declared as a newly authored test file is compared only against its own base overlay, so deleting a sibling pre-existing test file while adding a smaller one evades `observer-shrinkage`; the gate and its tests run from the head revision, so a commit that rewrites the checker is not caught by an independent base-pinned verifier; and an admitted check's echoed stdout is not stripped of control bytes; on a branch-creation push `github.event.before` is the all-zero SHA, so the CI step falls back to `HEAD~1` and checks the tip commit rather than the whole pushed range; and each resolved check runs once in the head tree, with that outcome applied to every obligation that declares it, so the guarantee is range/tip scoped — an intermediate regression repaired by the tip is not attributed to the commit that introduced it (avoiding a per-commit checkout of every commit, with fix-forward the accepted recovery). |
| LT-4 | A lesson whose evidence record was superseded is stale even when its own gate still passes, so recall should re-resolve the anchor against current records. | Deterministic differential. Control: a lesson whose referenced record is current. Treatment: a byte-identical lesson row whose referenced record was superseded, differing only by a marker-free supersession link. | The treatment lane is blocked or flagged while the control lane stays green. | The lanes are indistinguishable, or the control blocks. | retired | Retired 2026-09-12 without a differential. The proposed rule (Evidence cell names a path whose `git log <Falsifier-sha>..HEAD -- <path>` is non-empty, fired only for triggered rows) is rejected: Evidence is free prose naming symbols, module basenames, commits, and error strings, not owned paths, so parsing is inert or coincidental; only one row carries a Trigger, so fail-closed coverage is ~1; parsed Evidence paths nearly always coincide with the already-resolved enforcing gate, duplicating `stale-anchor`; and a later commit to a file is proof drift, not the ranked-record supersession StaleBench measures. Git history is not a ranked store and `recallLessons` is unranked, so a fixture would pass for the wrong reason. What is proven: `stale-anchor` fails a triggered row whose Falsifier or enforcing gate changed after the proof. What is not: that a superseded evidence record invalidates an otherwise green lesson. Grounded in StaleBench (ACL ARR 2026 August, OpenReview `1zCrxCUNtW`, unverified preprint), whose lower-rank mechanism stays unobservable here. Residual: KRN has no ranked retrieval consumer; reopen only when a ranked store and a historical-query consumer exist, with a real pairwise supersession fixture. |

| LT-5 | The content-vs-enforcement memory effect survives a neutral stratum, repeats, and a second model family. | Registered 2026-09-13. Start with a one-decisive plus one-neutral separation gate (six runs) before scaling to eight frozen tasks in two strata (decisive where a lesson applies implicitly, neutral of equal shape where none does), three arms (A ablation, B content, C forced reconstruction), at least three reps for A as well as B/C to estimate variance and a minimum detectable effect, and a length-matched irrelevant (placebo) row as an arm-B control. Families: `deepseek-v4.1-flash` (opencode transport) and `gpt-5.6-luna` (codex transport); `gpt-6-astra` is the creative escalator; `glm-5.3` and luna-via-opencode runs are quarantined. The single blinded decider sees anonymized, left/right-randomized, trailer-stripped packets. Explicit bwrap binds only, fixture and answer key outside every bind with a committed salted hash manifest for retention, held-out check copied in only after the agent exits, per-run sentinel; host-root exposure is defined as access to `/` or host `$HOME` outside the declared binds. bwrap must be >= 0.12.0 (CVE-2026-87766, GHSA-pxhw-h44j-8pfx: setup-time creation follows a parent symlink onto /oldroot and writes on the host outside every bind); the pre-run assertion must check `bwrap --version` and run a setup-write probe, and the 0.11.2 host is a stated confound. The MDE must come from the paired-binary required-N (McNemar) with a cluster design effect over the 8 tasks and 2 strata; three reps are repeated measures. `/run` exposes only name resolution (a static resolv.conf or the resolved subpath) with a private `/run/user`, and a pre-run probe must show `busctl --user` and `flatpak-spawn --host` fail inside the sandbox. Arm C runs the harness read-only via --root with a git shim that fires only on `unreconstructed-recall` and holds the change-contract obligation constant across B/C, so a C effect is attributable to recall enforcement. A mechanical pre-run assertion requires `memory recall` to return zero hits for every neutral changed path, and arm A's neutral pass rate strictly between 0 and 1. | Held-out pass by arm and stratum, wall time, tokens in/out, delivered context (not nominal budget; arXiv:2608.31057), diff size, decider score, sentinel leak, host-root exposure. | Content is generic priming, not memory: the decisive difference-in-differences over the neutral stratum does not clear the estimated minimum detectable effect (not a fixed 0.25). Enforcement is unattributable if pass(C) beats pass(B) only with material extra cost or if the shim fires on a neutral task. Promotion kill: sentinel leak, declared host-root or answer-key read, held-out reachability during execution, or a neutral path that matches a trigger. | lab-test | Protocol registered 2026-09-13; isolation dry-run validated and the separation gate was run (N=3, a content effect but non-promoting; see below). Non-proofs: the only authorized calibration (deepseek) is at ceiling with no separation power and the separation gate is N=3, so no mechanism is promoted on this row. The codex lane is not hermetic here (npx/mise wrapper) and is a stated non-proof unless pinned by hash; the decider shares a provider with the opencode family; and a definitional ablation without a placebo cannot separate content from added context on its own. Dry-run findings: `opencode --version` runs under explicit binds only with `/run` and `/sys` bound (omitting `/run` gives an API connect error), a fresh share dir without an auth seed fails (`UnknownError`), and with those fixed a one-prompt run exited 0 with token usage captured from `events.jsonl` (9,427 in / 2 out) while a `$HOME` canary and `/mnt` stayed invisible. Seed only the auth file into the isolated share, never the whole 31 GB host share. The dry-run used the host's 0.11.2; a locally built 0.12.0 is now staged and probe-validated, so the dry-run alone still does not evidence isolation. |

| LT-6 | A fresh session given only the outcome capsule and repository state continues a bounded multi-step outcome without a named stage loss — a requirement not becoming a task, edit drift, contradicting evidence, or silent completion — and the capsule is sufficient without the transcript. | Registered 2026-09-15. Blinded/differential: phase 1 runs one agent to a boundary and writes the capsule; phase 2 runs a fresh session with no transcript. Control lane: phase 2 with the repository but no capsule (or a deliberately stale/contradictory capsule). Treatment lane: phase 2 with the boundary capsule. Third lane: phase 2 with the phase-1 transcript, to separate "capsule replaces the transcript" from "capsule merely helps". One frozen task family with a held-out acceptance check; bwrap isolation, sentinel, and an anonymizing decider per LT-5. This models the context boundary as an enforced phase split because the harness cannot force a real host window overflow. | Held-out completion; named stage-loss incidents; edit drift (phase-2 diff against the intended slice); wall time; tokens in/out; silent-completion count. | Treatment is not better than the no-capsule control at equal cost, or a named stage loss appears with the capsule, or the transcript lane dominates the capsule without a cost explanation. | lab-test | Separation gate run 2026-09-16 (one task x {control, capsule, transcript} x 3 reps, `gpt-5.6-luna` via codex, bwrap 0.12, zero sentinel leaks): held-out 0/3 control, 3/3 capsule, 3/3 transcript, capsule ~27s vs control ~41s. The capsule is sufficient for a fresh session to continue a bounded outcome whose decision is not in the repository, and it matches the transcript here. Non-proofs: phase 1 is scripted, so the capsule is lab-authored and this measures capsule sufficiency, not the agent's ability to write one; the control cannot know the exact strings by construction, so the contrast is large by design; one task, one family, three reps; the boundary is an enforced phase split, not an observed host overflow, and the compaction arm is separate. Mechanical half: the capsule ABI, `state compile`/`resume`, the continuity degradations (`missing-field`, `unresolved-placeholder`, `active-without-next`, `stale-fixed-point`, `complete-without-commit-anchor`), and a compile-to-resume round trip are gated. Compaction arm 2026-09-16 (same decision, one in-session run per arm, 12k window, ~11-12 auto-compactions while reading 312 KB of docs): held-out passed with the decision in the prompt (arm A, no hook) and with the decision only in the capsule injected at SessionStart (arm B). At this scale the host summary preserved the decision, so the boundary hook is belt-and-braces in-session, while the capsule is load-bearing for fresh sessions (the separation gate above). Non-proof of the compaction arm: one task, one family, and a pass cannot separate "the summary retained it" from "the agent re-read the on-disk capsule". This row is the recorded reopen trigger for context isolation and paired-continuation evaluation. |

| LT-7 | An AFK worker session in an isolated worktree, given one `ready-for-agent` ticket, the outcome capsule pointer, and trigger-matched lesson recall, produces a commit whose deterministic memory gates pass, and a single integrator merges it with no unplanned capsule divergence or stale-anchor drift. | Registered 2026-09-16. Deterministic differential first, then a bounded throughput lane; see the LT-7 lane runs section below for the protocol, runs, and limits. | Gate outcomes, integrator repair count, held-out acceptance, wall time, billed tokens per successful ticket. | The worker cannot satisfy recall without copying the lesson text, or the merged fixed point diverges, or the parallel lane does not beat sequential at equal quality — then the tracker-as-control-plane defer stays. | lab-test | Mechanical, live, and repeatability runs passed 2026-09-16; details, token costs, gate-caught fixture defects, external baselines, and non-proofs are in the section below; the lane mechanics are adopted local-only per the orchestration mechanism row, while the behavioral claim stays `lab-test`. |

| LT-8 | A cheap worker model, given only the stage entry, the project facts, and the gates, produces a frontend section that passes the per-section acceptance — and repairs policy findings — without the maintainer writing or fixing code. | Blinded/differential: one frozen section brief x {control: the same model and repository without the frontend skills or stage entry; treatment: with `$frontend-stage` and the six owners installed and the facts present} x N reps; the maintainer's hand-written version is the acceptance reference only. Held-out acceptance: the deterministic gates (`frontend:audit`, `frontend:facts`, `lint:css`, `build`, the ACF/contract tests) plus a rescoped reader on the qualitative bar (no duplicate block, no styles hidden in a section file, thin skeleton). The per-section acceptance is already partly frozen as conformance cases (`frontend-audit-catches-facts-registry-drift`, `frontend-facts-flags-an-unknown-mapped-block`) and the `block-ownership`/`variant-naming` tests. | Held-out acceptance pass; hidden-block or duplicate-block incidents; maintainer repair edits; wall time and billed tokens per accepted section. | The treatment is not better than the no-skills control at equal cost, or a section passes the gates while hiding a block in a section file, or the acceptance needs maintainer repair. | Registered 2026-09-16; no blinded run yet. | Two engineering runs motivate it and are not proof: `gpt-5.6-luna` built the Courses section from a one-line brief (facts read, ACF layout, card block, gates green) and then repaired all 22 policy findings from a single "make the audit green" brief with the gates re-verified independently — but both ran unblinded, with the maintainer present and the repository facts already written. Limits: one project, one model family, one section, maintainer-written briefs, and no control lane or cost comparison. |

| LT-9 | The conditional SessionStart onboarding signal makes a fresh session in an unmanaged work tree attempt the read-only adoption report, without harming the requested task. | Registered and run 2026-09-16. Differential behavioral comparison: control (no hooks seeded) versus treatment (the branch `krn_memory.py` plus a SessionStart `hooks.json` seeded into a fresh CODEX_HOME), same neutral task (`append one line to notes.md, do not commit`), alternating order, three reps per arm, `gpt-5.6-luna` under bwrap 0.12.0; both arms run with `--dangerously-bypass-hook-trust`, which `codex exec` requires for any hook to fire. | `inspect_attempt` (a `krn-codex repo inspect` command present in the session events), `onboarding_seen` (signal text in the rollout), task completion, wall time. | Treatment is not above control in inspect attempts, or the signal derails or blocks the requested task. | lab-test | Result 2026-09-16: the recorded alternating batch is 3/3 treatment sessions attempting the report versus 0/3 control, and all six sessions completed the task (wall 16–20s); one further signaled probe session also attempted it, so signaled sessions total 4/4, while three earlier treatment attempts used a pre-signal hook build and were excluded as instrument defects; the treatment sessions reported `krn-codex: command not found` and continued, because the CLI is not installed in the sandbox. Non-proofs: N=3 per arm, one family, one trivial task and repo shape, detection is a mechanical event scan rather than a blinded decider, the measured behavior is an attempt rather than a completed inspection or adoption, and the hook needs an explicit trust bypass under scripted exec. Runner and fixture stay outside the repository at `lab/lt9/`. |
| LT-10 | The opencode adapter delivers the ported KRN guard, capsule brief, and adoption signal into real opencode sessions without derailing the user's task. | Registered and run 2026-09-16. Deterministic hook tests plus live `opencode run` sessions on this host (`deepseek-v4.1-flash` via opencode-go): a write and a shell redirect into `.git/**` (guard), a capsule whose next action carries a sentinel the prompt never states (brief), and an unmanaged work tree with `AGENTS.md` (signal). | Guard: the protected path stays absent and the session reports the block; brief: the sentinel appears in the final answer; signal: the session surfaces the read-only report and still completes the requested task. | A guard bypass, a missing brief, or an injected context that derails the requested task. | lab-test | Result 2026-09-16: the guard blocked both the write tool and the shell redirect, and `.git/hooks/pre-commit` stayed absent; the capsule sentinel was answered in both reps; the first signal rep (task-like wording injected into the user turn) derailed the requested edit (0/1 completion), and after injection moved to the system prompt with environment-note wording the task completed 2/2 while the model ran the report 0/2 and mentioned it once. Non-proofs: one model family and transport, one host, small N, no blinded decider; the guard delegates to the installed policy rather than proving a sandbox; interactive sessions only, since AFK lanes remain Codex-only; the live sessions read injected context, which is a mechanism test, not a quality measurement. |
| LT-11 | An opencode worker session in the LT-7 lane, given a real repository ticket, produces a commit that satisfies the same discipline as the Codex worker: a red deciding check first, exactly one trailer-carrying commit, and green worker and integrator gates. | Registered and run 2026-09-16. The lane runner gained `WORKER=opencode` (opencode 1.18.30, auth-only seed, `XDG_DATA_HOME`/`XDG_CONFIG_HOME` isolation, unset DBus/XDG runtime dirs, git common dir bound for the worktree), and the ticket adds the fail-closed guard mapping plus its test to this repository from `origin/main` at `20782b0`. | Worker commit subject and trailers, worker-side `changes check --before --strict-recall` (base-executed red->green on the new test), the repository's full `npm run gate` in the worker worktree, served provider/model identity, sentinel leak, wall time. | The worker commits without the required trailer, the deciding check is not red at the cut base, the served model mismatches, or the full gate fails in the worker worktree. | lab-test | Result 2026-09-16: the opencode worker produced `6a052089` ("fix(opencode): block unmappable write-capable tool calls") carrying `Change-contract: test/opencode/failclosed.test.mjs:red->green`; the worker gate passed with a base-executed red->green, `served_model=opencode-go/deepseek-v4.1-flash`, no sentinel leak, and the full repository gate is green in the worker worktree (77s wall). Non-proofs: one ticket, one transport, one model, one rep; the opencode worker does not receive the Codex hook layer (capsule brief and destructive guard are not exercised inside the session); the lane stays lab-side, and the runner's served-model check produced a false mismatch on the first run until it compared the full provider/model identity. |
| LT-12 | An opencode worker completes a multi-file, behavior-preserving refactor under a line-budget ratchet, and the integrator can commit a verified uncommitted tree without changing it. | Registered and run 2026-09-16. One ticket on this repository from `origin/main` at `96797ce`: add a 650-line budget test for `scripts/lib/install/install-release.mjs`, extract the inspection and pruning concern into `scripts/lib/install/install-inspect.mjs`, keep the public API, and wire the manifest and `test:lib`. | Deciding-check verdict (red at base, green after), full `npm run gate` in the worker worktree, the extraction boundary, served model identity, wall time, and whether the worker committed. | The refactor changes behavior, the public API breaks, the worker tree cannot pass the full gate, or the integrator has to modify the tree to make it pass. | lab-test | Result 2026-09-16: the worker dropped `install-release.mjs` from 752 to 290 lines with a 489-line `install-inspect.mjs`, kept the re-exported API, wired `runtime_paths` and `test:lib`, and passed the full gate; `served_model=opencode-go/deepseek-v4.1-flash`, no sentinel leak, 407s. It did not commit: the integrator committed the verified tree unchanged (`28e91d8`). Non-proofs: one ticket, one transport, one model, one rep; the extraction boundary is the worker's choice and only behavior preservation is proven, not that the boundary is best; the skipped commit means the lane's end-to-end autonomy is not demonstrated for refactors. |
| LT-13 | Two concurrent opencode workers on disjoint refactors, merged by one integrator on an integration branch with a resolved manifest conflict, preserve behavior and satisfy every gate on the merged fixed point. | Registered and run 2026-09-16. Two tickets from `origin/main` at `950b53a`: bring `catalog-inventory.mjs` under a 650-line ratchet by extracting path helpers, and `catalog-usage-normalize.mjs` under a 600-line ratchet by extracting literal decoding; both lanes ran concurrently through the LT-7 runner with `WORKER=opencode`. | Per-lane worker gates (base-executed red->green), commit trailers, module line counts after extraction, the integrator's merge-conflict count and resolution, and the full `npm run gate` on the merged fixed point. | A lane changes behavior, the public API breaks, the merged gate fails, or the integrator must change worker output beyond the known manifest conflict. | lab-test | Result 2026-09-16: both workers committed (`60852fd`, `f2e0700`) with `Change-contract: ...:red->green` trailers, `served_model=opencode-go/deepseek-v4.1-flash`, no leaks, 292s and 208s walls in a 294s window; the modules dropped from 726 to 526 (plus a 216-line paths module) and from 620 to 377 (plus a 258-line literals module); the integrator resolved one `package.json` test:lib conflict (two added paths) and the full gate is green on the merged fixed point. Non-proofs: one batch, one model and transport, disjoint files chosen to avoid serialization; the merge commit carries a `green->green` contract because its resolution is list concatenation; no concurrent-versus-sequential timing comparison was measured. Repeat 2026-09-16 (batch 4): `catalog-inventory.mjs` 526 to 444 (plus an 83-line records module) and `change-contract.mjs` 587 to 377 (plus a 270-line runs module), both ratchets tightened inside their budget tests; lane E committed itself, lane F's worker left the commit to the recovery session and shipped without the churn-trigger `Recall` trailer, which the integrator repaired before the gate; the integrator resolved one `test:lib` conflict and the full gate is green on the merged fixed point. |
| LT-14 | The batch pattern repeats, and the merge commit itself satisfies the harness: two concurrent opencode workers on disjoint module extractions, one integrator resolving the manifest conflicts, a merge commit carrying its own `green->green` contract, and every gate green on the merged fixed point. | Registered and run 2026-09-16. Tickets from `origin/main` at `700fa5b`: `change-contract.mjs` under a 600-line ratchet by extracting command analysis, and `scripts/catalog.mjs` under a 500-line ratchet by extracting report rendering; both lanes ran through the LT-7 runner with `WORKER=opencode`. | Per-lane worker gates (base-executed red->green), commit trailers, module line counts, the integrator's conflict count and resolution, the merge commit's contract, and the full `npm run gate` on the merged fixed point. | A lane changes behavior, the merged gate fails, or the merge resolution needs edits beyond the known `test:lib` concatenation. | lab-test | Result 2026-09-16: `catalog.mjs` dropped from 535 to 256 (plus a 297-line report module) and `change-contract.mjs` from 640 to 587 (plus a 58-line command-analysis module; its budget test passes at 587/600, a tight fit); lane D committed `72009f3` while lane C's worker left an uncommitted tree that the integrator committed as `959d79a` with the same trailer; the merge `8b927e5` resolved one `test:lib` conflict and carried `Change-contract: test:catalog:green->green`; both lanes ran concurrently (293s and 223s walls in a 294s window), `served_model=opencode-go/deepseek-v4.1-flash`, no leaks; the full gate is green on the merged fixed point. Non-proofs: one batch, one model and transport; the second worker again skipped the commit rule on the larger module, so refactor autonomy still relies on the integrator; the change-contract extraction is shallow and the module sits near its budget; no concurrent-versus-sequential timing comparison was measured. |
| LT-15 | The lane never hands off uncommitted work: when a worker session ends without a commit, the runner verifies the head against the cut base and runs one bounded recovery session in the same worktree that commits the existing changes with the same trailers. | Implemented 2026-09-16 in `run-ticket.sh` (`commit_recovery=not-needed|attempted|succeeded|failed`) and verified twice: a real ticket where the worker committed itself, and a fixture ticket that explicitly forbids committing, which drove the recovery path end to end; the same run also carried the `lessons.mjs` extraction from 460 to 371 lines plus a 94-line `lessons-recall.mjs` under a 400-line ratchet. | The reported `commit_recovery` value, the recovery commit's subject and trailers, the worker gate (base-executed red->green), served model identity, and the sentinel. | The recovery session fails to commit, changes the work, or adds a commit on a clean tree. | lab-test | Result 2026-09-16: normal path — the `lessons.mjs` ticket was committed by the worker (`a6c22c0`, 292s, `commit_recovery=not-needed`, gate 0). Recovery path — fixture ticket 22 deliberately forbade committing; the runner detected the unchanged head with a dirty tree (`attempted`), the recovery session committed the existing changes (`66fd9cd`, `commit_recovery=succeeded`) with `Change-contract`, `Recall`, and `At-risk` intact, and the worker gate passed; recovery events are retained at the run's `out/recovery-events.jsonl`. Non-proofs: the recovery path was exercised through an instructed no-commit fixture, not by a naturally skipping worker; one model and transport; the runner proves no work was lost and the gate passed, not that the recovery diff equals the first session's diff; recovery wall time is not reported separately. |
| LT-16 | The recovery session reproduces the first session's tree exactly: the runner reports `recovery_diff=match` for an identical tree and `changed` for any content difference, with `recovery_seconds` beside it. | Implemented 2026-09-16. Before recovery the runner snapshots the uncommitted work with `git stash create` (leaving the worktree untouched), then compares the recovery commit against that tree; both directions proven with the deterministic stub transport double (`stubs/commit-on-recovery.sh` and its mutated variant), and attempted with real workers. | `commit_recovery`, `recovery_diff`, `recovery_seconds`, the recovery commit's trailers, and the worker gate. | The report says `match` for a differing tree, or `changed` for an identical one. | lab-test | Result 2026-09-16: stub double — first phase writes the fix uncommitted, recovery commits: `recovery_diff=match`, gate 0; mutated stub — recovery rewrites the line: `recovery_diff=changed`, gate 0. Real-model attempts did not reproduce a natural no-commit under the new fields (two runs committed anyway, one wandered, one spotted the injected shim), so the model-side trigger remains unobserved. Non-proofs: the stub proves runner mechanics, not worker behaviour; the snapshot covers the worktree at snapshot time only; the stub's `recovery_seconds` was zero, so timer correctness is unverified; lane F later showed a recovery-committed change can still miss the churn-trigger `Recall` because the runner's prompt trailer extraction could not parse prose gates, which the runner now derives from the recall JSON contract. |
| LT-17 | The normalized ticket ABI drives ticket hygiene: one fenced block carries the id, status, type, base, scope, deciding check, contract, acceptance, blockers, recall, and execution hints; `ticket check` fails invalid, duplicate, unknown-blocker, and cyclic tickets and warns on commit-trailer orphans; `ticket next` prints only the unblocked ready frontier. | Implemented 2026-09-16: `scripts/lib/ticket/ticket.mjs` plus `krn-codex ticket check|next`, with deterministic fixtures in `test/ticket/ticket.test.mjs` for valid, invalid-status, missing-field, duplicate-id, unknown-blocker, cycle, blocker-frontier, ordering, and orphan-warning cases; the design and the Beads mapping live in `docs/research/ticket-protocol.md`. | Check verdicts and frontier lists on fixtures; orphan warnings from `Ticket:` commit trailers. | A valid ticket fails, an invalid or cyclic ticket passes, or the frontier includes a blocked ticket. | lab-test | Result 2026-09-16: 5/5 fixture cases pass and the CLI reports a clean repository. Non-proofs: fixture-only; the envelope wiring is implemented in the lab runner (the `TICKET` path alone drives the base, scope, deciding check, contract, and execution agent, with environment variables only as legacy fallbacks) and proven with the stub double: the recovery commit carries `Ticket: t-abi-1` plus the derived `Change-contract`, `Recall`, and `At-risk` lines with `recovery_diff=match` and a green worker gate; a real-model run from an envelope followed on 2026-09-16: the runner selected the executor from `Execution: agent=opencode`, the worker implemented `krn-codex ticket show` with its own red->green observer test in 196s (`served_model` verified), carried `Ticket: ticket-show-1` plus the derived contract trailer, and passed its worker gate; orphan detection scans the last 200 commit bodies and reports warnings, not errors; cross-repository dependencies are out of scope. |
| LT-18 | The frontier-driven task loop closes: `krn-codex ticket claim` writes `Claim` and `Status: claimed` before work, the envelope-driven lane merges through the integrator, `krn-codex ticket close` writes `Evidence` and `Resolution`, and a ticket blocked by another is only picked after its blocker closes. | Implemented 2026-09-16: `claimTicket`/`closeTicket`/`findTicketFile` in `scripts/lib/ticket/ticket.mjs` plus the CLI `ticket claim|close`, with `test/ticket/ticket-lifecycle.test.mjs` observing the module and CLI lifecycle; the lab `run-frontier.sh` drives `ticket next` -> `ticket claim` -> `run-ticket.sh` lane -> integrator merge -> `ticket close` -> next frontier with a `MAX_RUNS` cap. | `Status`/`Claim`/`Evidence`/`Resolution` fields, `ticket next` output, and `ticket check` verdicts on the fixture. | A claimed ticket stays in the frontier, `close` leaves the ticket without evidence, or the loop picks the blocked ticket first. | lab-test | Result 2026-09-16: the stub-driven loop on the LT-7 fixture ran two iterations in frontier order (`t-f1`, then `t-f2` blocked by `t-f1`, then `frontier=empty`), each lane merged with `recovery_diff=match` and a green worker gate, `ticket close` recorded the merge sha as evidence, the final `ticket check` was clean, and the lifecycle observer passed 5/5 including the CLI path. A real-model iteration followed the same day: the loop picked `t-f3`, the envelope selected opencode (`served_model=opencode-go/deepseek-v4.1-flash`), the worker commit carried `Ticket: t-f3` with the derived `Change-contract`, `Recall`, and `At-risk` trailers, `recovery_diff=not-applicable`, the worker gate exited 0, and the merged check passed. Non-proofs: the loop merges locally without review or publication authority; concurrent claims are not fenced. |
| LT-19 | The harness drives its own repository: an opencode lane cuts from the repository main, satisfies a red->green budget observer behind one control seam, the worker gate stays green, and the change integrates through a reviewed PR with the full gate. | Implemented 2026-09-16: the self-hardening scan named `scripts/krn-codex.mjs` as the largest tracked module (501 lines) with the ticket subcommand inline; ticket `sh-1` in the local `.scratch/tickets/` queue (`Execution: agent=opencode`) drove `run-ticket.sh` against this repository; the worker extracted `scripts/lib/ticket/ticket-cli.mjs` (exported `runTicketCommand`), added `test/cli/cli-budget.test.mjs` (CLI budget 450 + single-seam and delegation assertions, declared red->green), wired `test:lib`, and added the module to `skills/manifest.json`. | Lane log fields (`worker=opencode`, `ticket_abi=yes`, `ticket_id=sh-1`, `served_model` verified, `worker_gate_exit=0`), CLI 501 -> 444 lines, 18/18 ticket and CLI tests, quality audit clean, `npm run gate` green on the integration branch, PR #33. | A lane that leaves the CLI over budget while its observer passes, or an integration that skips the reviewed PR. | lab-test | Result 2026-09-16: lane `ticket/live-ec749f297657` delivered commit `96ffaf7` in 279s with the derived trailers; integration branch `self-hardening/sh-1` merged it and ran the full local gate green; published as PR #33. Non-proofs: the claim was recorded by the integrator after the lane (the run bypassed `run-frontier.sh`, so the claim timestamp does not bracket the work); the worker edited `skills/manifest.json` outside the declared Scope and needed the scope corrected, so Scope is documentation, not enforcement; the frontier loop's local merge was replaced by manual review, so the loop itself was not exercised end-to-end on a reviewed repository. |
| LT-20 | Scope is enforced, not prose: `krn-codex ticket check --id <id> --base <ref>` reports every changed file outside the ticket's Scope as `scope-undeclared`, so a lane that edits an undeclared file fails its own check. | Implemented 2026-09-16: `ticketScopeFindings` in `scripts/lib/ticket/ticket.mjs` (git diff --name-only base..head against comma-separated paths and globs) surfaced through `ticket-cli.mjs`; observer `test/ticket/ticket-scope.test.mjs` declared red->green and loading the module dynamically, because the first lane failed the worker gate with `before-state-unverified` (a static import of the new rule is a setup error at base, not a red assertion); the friction came from the sh-1 lane editing `skills/manifest.json` outside its declared Scope with no gate firing. | `krn-codex ticket check` errors and exit code on a fixture repository with declared and undeclared changes. | A lane that edits an undeclared file passes its check, or a fully declared diff fails. | lab-test | Result 2026-09-16: lane `ticket/live-3bc899d36a80` (opencode, wall 258s, `worker_gate_exit=0`) delivered `082b237`; the lane's own diff checks clean under the new rule; 23/23 ticket and CLI tests; the CLI stays at 444 lines; `npm run gate` green on the integration branch; published as PR #34. Non-proofs: the runner's worker gate does not call the scope rule yet (the integrator runs it); glob support is the checker's own matcher and renames are seen as the new path only. |
| LT-21 | The repository quality audit is gated: `npm run gate` runs `scripts/quality-audit.mjs --root .` before `changes:check` and CI runs the same command through the `quality:audit` script, so dead exports, credentials, and duplicate bodies fail the gate instead of waiting for a human. | Implemented 2026-09-16: the sh-3 lane added the `quality:audit` script, inserted it into the gate chain and `.github/workflows/validate.yml`, and added `test/audit/quality-audit-gate.test.mjs` (five cases: gate membership, ordering before `changes:check`, resolved chain, workflow parity, wrapper failure on findings) wired into `test:lib`. | Gate and workflow files, the shared command string, and a fixture run of the wrapper over a seeded finding. | A gate or workflow that drops the audit, a second audit command, or a wrapper that passes with findings. | lab-test | Result 2026-09-16: lane `ticket/live-432460eae7d2` (opencode, wall 190s, `worker_gate_exit=0`) delivered `72bcd5f`; 5/5 observer cases; the audit ran clean inside the lane tree; full gate exit 0 in the lane tree and on the integration branch; the lane diff passed the scope rule; published as PR #36. Non-proofs: the audit still counts test importers as consumers (37 test-only exports stay invisible) and scans `scripts/`, `test/`, `skills/` only, not `config/` or `.agents/`; the ordering assertion pins the gate seam, not the audit's rules. |

## LT-7 lane runs (2026-09-16)

Runner and fixtures live outside the repository at `lab/lt7/`. `run-ticket.sh`
cuts an isolated worktree from the fixture main, asserts the deciding check is
red at that base, builds a prompt with the ticket, the capsule pointer, and
`memory recall --changed` output, runs a fresh pinned codex session under
non-setuid bwrap 0.12.0 with an auth-only seed, and host-executes the worker
gate. `integrate.sh` merges `--no-ff`, re-runs the fixture tests, and gates the
merged fixed point. This lane is the reopening experiment named by the
orchestration tracker defer row. Registration limits carried from the entry: one
repository and tracker, Codex as the only executor, local commits only with
push and PR not authorized.

Mechanical phase (scripted worker, no model session): a commit without `Recall`
failed `--strict-recall` as `unreconstructed-recall` with a confirmed
base-executed red->green; a commit carrying `Recall` but not declaring the
lesson's test failed as `unused-recall`; the repaired commit passed; the
integrator merge over the range passed with the merge commit not re-evaluated
for recall; a filled capsule passed `state check` clean.

Live phase (`gpt-5.6-luna` via pinned codex 0.154.0, non-setuid bwrap 0.12.0,
zero sentinel leaks, `model_mismatch=no`): a fresh session cut from the red base
committed `0d747de` with `Change-contract`, `Recall`, and `At-risk`; the worker
gate and the integrator gate both exited 0 with an executed red->green flip
(33s wall), and the merged tree passes `node --test`.

Repeatability: two further mechanism-distinct tickets (route registry dispatch,
version-salted digest) each produced exactly one worker commit with the same
three trailers and passed both gates; billed input was 68k–84k tokens per
ticket (58k–73k cached) with 0.8k–1.0k output.

Two fixture defects were caught by the gate rather than the model, and each
consumed one model session: a lane cut from an already-solved base failed as
`before-state-not-red`, and the worker manufactured a `String(VERSION)` no-op to
satisfy the commit rule (the fixture main was then rewound once to redo the live
run); a base whose deciding check failed as an import or load error failed as
`before-state-unverified`. The lane requires a red failure at the cut base,
which the runner asserts before any model call; a load or import error is not
red and is caught after the session by `changes check --before`.

External baselines from the 2026-09-16 sweep: cross-agent textual PR conflicts
run 41.7% vs intra-agent 19.8% (arXiv:2607.04697), and review or duplicate-work
load, not generation, is the measured constraint (MSR 2026 PR-outcome studies).

Parallel lane (2026-09-16, same runner): two mechanism-distinct tickets (schema
membership, display-label resolution) were seeded on one base and run as two
concurrent `gpt-5.6-luna` sessions in separate worktrees; both produced one
trailer-carrying commit and passed their worker gates (35s and 29s wall,
`sentinel_leak=no`, `model_mismatch=no`), billed 68k–69k input tokens (52k–58k
cached) each, and the integrator merged both with zero conflicts and a green
merged-fixed-point gate because the file sets were disjoint. The conflicting
pair ran in the conflict lane below, where one trailer repair and one conflict
resolution were recorded.

Conflict lane (2026-09-16, same runner): two tickets whose fixes touch the same
line of `src/registry.mjs` were seeded on one base and run concurrently (46s and
36s wall, `sentinel_leak=no`, `model_mismatch=no`; billed 69k–106k input tokens,
58k–78k cached); both workers received the same two recalled lessons. One worker
emitted the exact `Recall` and `At-risk` trailers and passed its gate; the other
invented a `Lesson: ... Test: ...` format and failed strict recall as
`unreconstructed-recall`, so the integrator repaired the trailer and re-gated
clean (one repair). Both workers then turned out to have implemented both
invariants, so the merge conflict was stylistic: one conflict on the shared
file, resolved by taking either equivalent form, and the merged tree passes all
seven checks with a green range gate. Repairs: one trailer repair and one
conflict resolution.

Throughput lane (2026-09-16, same runner): four disjoint tickets were seeded on
one base and run as four concurrent `gpt-5.6-luna` sessions; all four worker
gates passed and the integrator merged all four with a green range gate over
eleven passing checks. The four-session window was 42s against a 127s sum of
individual walls (about 3.0x), billed 68k–83k input tokens (60k–69k cached)
each. The first batch exposed an instrument defect: the prompt's backticked
trailer rule was eaten by shell command substitution, so the rule text arrived
mangled and 4/4 workers invented a `Lesson: ... Test: ...` format that each
gate rejected as `unreconstructed-recall`; the runner now emits the exact
`Recall` and `At-risk` lines per recalled lesson, after which the batch passed
clean.

Hook-injected continuation (2026-09-16, same runner, `HOOKS=1`): the runner
seeds the installed `krn_memory.py` and a SessionStart/PreCompact `hooks.json`
into the worker's fresh CODEX_HOME, forwards the ignored
`.krn/runs/delivery-loop` state into the worktree (ignored run state does not
cross into a worktree by default), and runs `codex exec` with
`--dangerously-bypass-hook-trust`, which scripted exec requires before any hook
fires. The worker rollout contains the injected capsule brief and the worker
completed and gated ticket 12 unchanged (12/12 fixture checks, green range
gate). Non-proofs: one ticket and family; this proves hook delivery into the
worker session, not that the capsule text changed the outcome.

Capsule handback (2026-09-16, same runner): after the integrator merged ticket
13, the active capsule reported `stale-fixed-point`; the integrator writeback
(`lab/lt7/capsule-writeback.py`, wired as an optional `CAPSULE=` step in
`integrate.sh`) updated the capsule's base/HEAD, evidence, and next action, and
`node --test` passes thirteen checks with `state check` clean and
warning-free. `state check` also caught a fixture defect first: two registry
lessons shared `path:src/registry.mjs` and were rejected as a duplicate trigger
(`malformed-lesson`, divergent), fixed by splitting the triggers
(`symbol:register` plus the path). Non-proofs: mechanical fields only; the
semantic capsule text stays with the sole writer, and one ticket is not a
handback-quality measurement.

Throughput N=8 (2026-09-16, same runner, hook-seeded): eight disjoint tickets
were seeded on one base and run as eight concurrent `gpt-5.6-luna` sessions;
every worker gate passed with `capsule_seen=YES` and no leak or model mismatch,
the integrator merged all eight with a green range gate over twenty-one passing
checks, and the eight-session window was 48s against a 246s sum of individual
walls (about 5.1x), 24–46s per session, billed 67k–84k input tokens each. No
provider throttling or infra failure appeared at this width. One lane ran with
an empty ticket block and an unmatched lesson trigger because of a case
mismatch in the fixture file names; it still fixed its check from the deciding
check line, but its recall path was not exercised, and the fixture was corrected
afterwards. Non-proofs: one model family and one rep per ticket; disjoint files
again, so merge-repair and duplicate-work remain unmeasured at this width, and
limits above N=8 are untested.

Non-proofs: twenty-one tickets (three sequential, two concurrent in the parallel
pair, two concurrent in the conflict pair, four concurrent at N=4, eight
concurrent at N=8, and two hook-seeded singles), one model family (Codex-only by
policy), one rep each,
disjoint files except the single stylistic conflict, so structured
merge-repair, duplicate work, and cost-per-success remain barely exercised; no
sandbox escape test and no hostile-process claim; fixtures and runner stay
outside the repository.

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

- Require a non-setuid bwrap beside the 0.12.0 floor: CVE-2026-41163 (setuid plus ptrace
  during the unprivileged setup phase; fixed 0.11.2, setuid builds dropped in 0.12.0) is a
  distinct class from the setup-write probe.

- Report retry-inflated workflow cost, not call price: retries can raise true workflow
  cost up to 4.25× the single-call price, and a failed chain must not be forwarded to the
  next model (up to −34.8 points; arXiv:2608.13571).

- Pick behaviorally distant families for cross-family lanes: distilled and same-release
  models are behaviorally nearest (85.7% attribution; arXiv:2606.16988) and arbitrary
  heterogeneous pools can fall below the best single model (arXiv:2609.17306).

- Pin per-agent models where the host supports it: Codex custom agents accept `model` and
  `model_reasoning_effort`, and Claude Code resolves subagent or skill `model:` frontmatter
  before the session model, so worker and reviewer models can be named in the agent
  definition.

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

Design bounds recorded from the fresh-source and lab-test-design reviews: the neutral arm manipulation changes the lesson file but not the delivered context (every neutral arm recalls zero applicable rows, because the irrelevant row's trigger never matches the edited path), so `B-P|neutral = 0` by non-delivery and `theta` collapses to the decisive contrast; the decisive trigger is exactly the file the agent edits (`path:src/greeting.mjs`), so retrieval fires at the edit point and the recalled row states the fix, meaning the contrast partly measures edit-point hinting rather than prospective recall; the boundary estimate has no finite normal-approximation CI (all twelve pairs discordant in one direction, no concordant pairs), so report the exact paired bound instead (`0.025^(1/12) ~= 0.735` lower for the decisive `B-P`, hence `theta >= ~0.735` as a bound); arm C is omitted here, so the enforcement half of the LT-5 claim is untested; and the second authorized family sits at ceiling, so it is a ceiling check, not a second-family replication. The salted manifest is retained in the lab directory (outside the repo) per the raw-fixtures-outside rule; this page commits the salt and ROOT only.

### Mechanism-distinct fixtures v4 (2026-09-14, `tasks-v4`)

PRD 0003's prerequisite: the v1–v3 shapes are one mechanism (a scalar value plus a revision scalar) renamed, so a `theta` that generalized across them would still be label generalization. `setup-tasks-v4.sh` (new) authors four mechanism-distinct couplings over the same four shape/stratum directory names, so `gate-tasks*.sh` is unchanged: a scalar revision counter (text), a bidirectional schema-membership validator (key), a route↔registration dispatcher (route), and a content digest (media). Each decisive variant carries a triggering lesson row and each neutral an irrelevant `CHANGELOG` row; every task has one main file, one companion file, the same visible-test shape, and the same prompt structure.

`check-tasks-v4.sh` (new) is the falsifier, 8/8: for each task the requested-change-only patch passes the visible `node --test` but fails the held-out coupling, the gold patch passes, the A/B/P arm files differ in both strata, and hits are decisive 1 / neutral 0. The held-out failure classes are mechanism-distinct and reproduced directly: `AssertionError` strictEqual (revision), `AssertionError` falsy (validator rejection), `Error: unregistered route` (dispatch), and `Error: digest mismatch` (checksum). Frozen identity: the companion-naming-prompt revision is salt `78a3390fc11d42c2`, ROOT `875de01f6e4dbd56` (v4a); the corrected non-leaking revision is salt `6607865f46aebc84`, ROOT `d9875f8d28c78c72` (v4b), 80 files each. Run on gpt-5.6-luna (see the mechanism-transfer results below); the v3 result remains the structure-matched separation evidence.

### Power simulation and feasible N (2026-09-14, `power-sim.mjs`)

Deterministic simulation of the registered design (N tasks per stratum, R reps, arms B/P paired within a rep; per-task true effects with task-level sd `tau`; two-sided 95% t-interval on the per-task differences). Type-I control is conservative (<=2.4% for N=4..64 at true `theta=0`). At the registered MDE `theta*=0.25` (`tau=0.1`, base discordance 0.1, R=3) the power on positivity (lower bound > 0) is 0.07 at N=4, 0.29 at N=8, 0.57 at N=16, 0.88 at N=32, so freezing at ~32 tasks per stratum (64 tasks, ~576 executions per family at three reps and three arms) is the smallest N with >=80% power; establishing the target itself (lower bound >0.25) has low power even at N=128, so that decision is intentionally stringent. At a conservative scenario below the observed v4b effect (`theta=0.5`, `tau=0.15`; the run's own estimate is 0.833) N=16 reaches 0.98 for positivity. Bound: this is a planning model with chosen `tau`/base, not power estimated from an interior-cell calibration (the corpus has none), and the authored mechanism-distinct pool is 4 tasks per stratum, so a properly powered confirmation at `theta*=0.25` is not feasible with the current fixtures. This is a lab re-implementation of the PRD 0002 simulation; the PRD's committed artifacts and its Monte-Carlo-uncertainty acceptance criterion remain uncommitted.

### Mechanism-transfer results v4a/v4b (2026-09-14, `results-codex-gpt-5.6-luna-v4a`/`-v4b`)

`tasks/` was replaced with the mechanism-distinct v4 set (v3 retained as `tasks-v3-frozen`). The first run (v4a) looked like no transfer: only the counter separated and schema/registry/digest were at ceiling in **both** strata (key/route/media decisive and neutral A/B/P 3/3), giving `theta = 0.250`, CI [0.000, 0.750]. Diagnosis: the v4a prompts named the coupled companion ("keep the record and its required-keys list consistent", "keep it dispatchable", "keep the payload and its digest consistent"), so the ablation arm was handed the coupling by the prompt itself; the v3 prompts stated only the requested change. This is the same class of confound as the earlier neutral-row leak, and it is now a fixture rule: **a prompt must state only the requested change, never the coupled companion.**

After removing the leak (v4b; corrected manifest salt `6607865f46aebc84`, ROOT `d9875f8d28c78c72`) gpt-5.6-luna ran 4 shapes × 2 strata × A/B/P × 3 reps = 72 executions, zero retries, all `served_model=gpt-5.6-luna`, `model_mismatch=no`, `sentinel_leak=no`: text/route/media decisive A 0/3, B 3/3, P 0/3 with neutral 0/3; key decisive A 2/3, B 3/3, P 1/3 with neutral A 3/3, B 3/3, P 2/3; `theta = 0.833`, cluster-bootstrap 95% CI [0.500, 1.000].

Reading: with mechanism-distinct fixtures and non-leaking prompts the content effect replicates — every mechanism's decisive B is 3/3 while the ablation and the wrong-content placebo mostly fail (placebo decisive 1/12 pooled), and it survives three genuinely different coupling mechanisms. It is not uniform: the schema-membership coupling is partly inferable (arm A passes 2/3) and its neutral is at the ceiling, so that mechanism carries the only non-degenerate interaction term. Non-promotion: one family with separation power (deepseek is at ceiling), the neutral stratum is still not interior (three floors, one ceiling), the placebo is wrong-content rather than length- or token-matched, and no frozen power analysis exists. The v4a artifact also shows how easily a prompt or page can hand the coupling over, so a confirmation must ship prompts and pages that state only the requested change.

### Cross-family v4b (2026-09-14, `results-deepseek-v4b`)

The same corrected v4 set on `deepseek-v4.1-flash` (opencode transport; 72 executions, two retried once on a transient provider error and recorded as `attempts=2`, zero INFRA, all `served_model=deepseek-v4.1-flash`, `model_mismatch=no`, `sentinel_leak=no`): every cell is at ceiling (A/B/P 1.0) except media/decisive P 0.667, so `theta = 0.083`, 95% CI [0.000, 0.250]. The second authorized family therefore has no separation power on the same fixtures — the base model solves every mechanism without the lesson. Cross-reading with luna (v4b `theta = 0.833`): the content effect appears where the base model lacks the knowledge and is invisible where it already has it, so the cross-family prerequisite is not met by raising difficulty alone; a confirmation needs mechanism-distinct tasks calibrated to each family's floor, or the claim stays single-family.

### Cue-free decisive set v5 (2026-09-14, `results-deepseek-v5` and `results-codex-gpt-5.6-luna-v5`)

The v4b decisive templates still stated the coupling in the companion's source comment and README sentence ("X and Y are coupled…"), so a base model that reads the code can infer the dependency without the lesson — deepseek v4b sat at ceiling. `setup-tasks-v5.sh` removes those ordinary-doc cues from both strata, leaving the coupling stated only in the decisive lesson row (the neutral has no cue), with the same prompts, tests, and hits; `check-tasks-v4.sh` over `tasks-v5` is 8/8 and the manifest salt is `34a880db94a05f66`, ROOT `7c736c77a19d9fee`.

deepseek-v4.1-flash (72 executions, zero retries, all served, no mismatch or leak): decisive text A 0/3 B 3/3 P 1/3, key A 2/3 B 3/3 P 3/3, route A 1/3 B 3/3 P 0/3, media A 3/3 B 3/3 P 2/3; neutral noisy; `theta = 0.583`, cluster-bootstrap 95% CI [0.167, 1.083].

Reading: removing the ordinary-doc cue gives the second authorized family separation power — deepseek now fails the decisive ablation on text and route and passes with the lesson where v4b was at ceiling — so the second-family prerequisite is materially advanced. It is not uniform: the key and media couplings stay inferable from code structure (arm A passes) even without the comment, so those mechanisms carry little content-specific signal for this family. Non-promotion is otherwise unchanged (N=4/stratum against the simulated ~32, a non-interior neutral, no length- or token-matched placebo, and an unfrozen confirmation).

gpt-5.6-luna on the same v5 set (72 executions, zero retries, all served, no mismatch or leak): decisive text/key/route A 0/3 B 3/3 P 0/3 and media A 0/3 B 1/3 P 0/3; neutral at the floor (key/neutral P 1/3 is the only arm pass); `theta = 0.917`, cluster-bootstrap 95% CI [0.500, 1.250]. The cue-free set makes luna's ablation fail on **every** mechanism (including schema, which was partly inferable in v4b), while media's lesson succeeds only 1/3 — a hint that the digest mechanism is harder to repair from the lesson alone. Two authorized families now separate on the same cue-free fixtures with bootstrap CIs above zero, which is the strongest two-family reading so far, still non-promoting on the unresolved prerequisites.

A candidate calibration pack for the reopen is built in the lab: the cue-free v5 tasks, a character-length-matched inert placebo (`make-placebos.sh` emits rows of 190/185/186/187 characters matching each decisive coupling row, reusing its trigger but with an already-satisfied `manual:review` gate), and a design for an interior neutral; none of it is run as a confirmation yet.

The interior-neutral design was calibrated across all four mechanisms and is **not** uniformly interior. The neutral template carries an optional `npm run verify` coupling check (`verify.mjs`) that the prompt never mentions — it says only to keep `node --test` passing — so the coupling is discoverable by initiative rather than delivered. gpt-5.6-luna on the neutral task with no lesson (`results-calib-interior-all`, 5 reps each): text 0/5, key 4/5, route 0/5, media 0/5. The rate is mechanism-dependent — the schema check is run or inferred almost always (near ceiling), the others never (floor) — so the optional-verify cue does not by itself produce an interior neutral, and the prereq stays open. It still gives a calibrated per-mechanism floor/ceiling map for choosing a better cue.

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
the required-N formula in the confirmation preregistration below; the earlier ~126/~59/~1,062 was not reproducible from
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
tasks per stratum with three reps (~792 A/B/P executions); this illustrative figure is superseded for the 80%-power N by the `power-sim.mjs` result above (~32 tasks per stratum), and this is a planning
candidate, not established power; the final N is frozen only after a
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

### Confirmation status (2026-09-14)

Not run as a frozen confirmation. Met: mechanism-distinct fixtures (v4b and the cue-free v5 set, salted identity), the pinned codex package, the isolation probe, fail-closed sentinel/INFRA gates, and a power simulation. Not met: an interior neutral on every mechanism (an optional-verify cue calibrates at text 0/5, key 4/5, route 0/5, media 0/5 — mechanism-dependent floor/ceiling, not interior), a length/token-matched placebo confirmed neutral (a character-length-matched inert placebo is built but not yet run in a powered design), a second family with separation power on every mechanism (deepseek v5 separates on text and route but is at ceiling on key and media), and feasible N at the registered MDE (the simulation puts 80% power near 32 tasks per stratum against 4 authored). Disposition: **explicit non-promotion**, not a failed confirmation — the mechanism is neither promoted nor shown inert, and the cue-free v5 set advanced the second-family prerequisite. Reopen by authoring the additional mechanism-distinct tasks (feasible engineering) or preregistering a larger MDE, making every mechanism non-inferable, and designing an interior neutral.

## Decision

`$source-to-decision` reads this page before promoting a behavioral mechanism.
`LT-3` is a deterministic check with a documented residual; `LT-4` is retired (its lower-rank mechanism needs a ranked store KRN forbids); the shipped proof-drift surrogate is `stale-anchor`; `LT-1` and `LT-2` are blinded
pilots that must run before the memory harness or cross-repo transfer is
described as effective rather than defensive; the `LT-1` content-vs-enforcement
question is probed by the `LT-5` gate: on the frozen luna v3 set every decisive shape separates (A 0/12, B 12/12, P 0/12) and the neutral is degenerate at the floor, giving a boundary estimate `theta = 1.000` with an exact paired 95% lower bound near 0.74; on the mechanism-distinct v4 set (v4b, non-leaking prompts) the gate gives `theta = 0.833` (95% CI [0.500, 1.000]): the content effect replicates across the counter, registry, and digest mechanisms and is weaker on schema-membership, so the v3 effect is consistent with transfer across the three separating mechanisms once a prompt leak is corrected — but this is one family at N=3 with a non-interior neutral, not a generalizing confirmation. No mechanism is promoted (non-interior neutral, deepseek at ceiling so only one family has separation power, unfrozen N).

### Closure (2026-09-15)

LT-5 closes as **documented non-promotion**, not as a funded pilot. An external read-only review at `6e7e616` endorsed this and advised against another separation run: the recorded `theta` values are promising but not confirmation, the second family is named `deepseek-v4.1-flash` not `gpt-5.4-deepseek`, and the ~32-tasks-per-stratum figure is a conditional planning result, not a universal requirement. The single decisive reopening, funded only when its result changes a concrete adoption decision, is an independently authored, frozen content-versus-matched-placebo transfer confirmation: new tasks, interior neutral controls, matched delivered context, both families, task-clustered power, and a preregistered interaction CI whose upper bound below the registered 0.25 effect kills the effect while spanning zero leaves positivity unconfirmed. Non-promotion does not require deleting the storage, delivery, or structural checks it uses. The stop rule and its residual bounds are recorded in `docs/adr/0003`.
