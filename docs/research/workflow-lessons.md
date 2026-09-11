# Workflow lessons

Status: `accepted`. Consumer: `$delivery-loop` at outcome bind. Owner: the lifecycle writer. Verified: 2026-09-10.

Cross-run workflow memory: the file-backed port of the Agents SDK `Memory()`
pattern. Each row is a reusable process lesson with the evidence that earned it
and the gate or owner that enforces it; case-specific findings stay in reviewed
artifacts. Bounded at 24 rows: displace or condense before adding.

| Lesson | Evidence | Enforced by |
|---|---|---|
| Derive the installed runtime closure from the artifact being installed, never from the running installer version. | A release silently omitted `state-brief.mjs` and still reported `filesystem_installed`. | `runtime_paths` in `skills/manifest.json`, the post-switch CLI smoke, and `test/install-smoke.test.mjs`. |
| Treat model-stated references as unverified; deterministic artifacts are authoritative. | A low-effort review misquoted a base commit SHA before self-correcting. | `config/AGENTS.md` proof rule; `manual:review` at the fixed point. |
| Prefer proactive capsule rewrites at boundaries over window-limit autocompact. | Context-rot and compaction studies plus official harness guidance. | `skills/engineering/delivery-loop/SKILL.md` step 3; `test/state-check.test.mjs`. |
| Commission review from a context that did not produce the change. | Self-preference and self-correction research, and the low-effort imitation probe. | `manual:review`; `test/composition.test.mjs`. |
| A budgeted surface accepts a new rule only after displacing or condensing existing text. | `delivery-loop/SKILL.md` reached 181 lines and `validate` failed until the fresh-context and lesson-candidate rules were condensed back to 179. | `scripts/validate.mjs`. |
| Render CLI diagnostics as text, never raw objects. | `krn-codex state check` printed `warning: [object Object]` for the first structured warning. | The readable-warning test in `test/state-check.test.mjs`. |
| A new falsifier must be shown failing on the pre-change or mutated behavior before it counts. | Mutation-testing benchmarks show LLM-authored suites detect a minority of mutants, and the first structured CLI warning broke only after a probe. | The proof rule in `config/AGENTS.md` and the fixed-point review gate. |
| Blocking errors must be visible in human command output, not only in the exit code. | A composition probe showed `state resume` exiting 1 on `lessons-over-budget` while printing no reason. | The blocking-errors brief test in `test/state-brief.test.mjs`. |
| A prose rule that no check enforces is ignored at low effort. | The explicit-only rule was ignored by a low-effort model until it was narrowed and behaviorally checked; per-slice and held-out rules now have a test/inspection gate. | `manual:review`; `scripts/lib/lessons.mjs`. |
| Hand-written capsule fixed points must use full commit tokens. | A hand-filled capsule with short hashes failed `state check` with `invalid-fixed-point` until the full tokens were used. | `test/state-check.test.mjs`. |
| Verification lanes on this host cannot spawn git children, so state tests run only in the main session. | Two independent luna reviews reported `spawnSync git EPERM` and could not execute `test:state`; each stated the execution gap instead of claiming a regression. | `manual:review`; `scripts/lib/state-check.mjs`. |
| A read-only review cannot prove runtime reachability; every extracted runtime module needs at least one executing test. | The extraction at `83101ae` left `derivedRolloutDay` calling an unexported `isValidDay`; luna reported no finding and only an end-to-end scan test surfaced the `ReferenceError`. | `test/catalog-usage-scan.test.mjs`; `manual:review`. |
| Broadening executing coverage can expose silently lost records that a green suite hides. | The manifest-name quarantine passed `family@marketplace` as the id, so the collector filtered it: the plugin was skipped and `hardQuarantine` kept no record until the plugin-cache integration test exercised the branch. | `test/catalog-inventory-quarantine-branches.test.mjs`. |
| Duplicated low-level adapters drift; centralize once and alias at call sites. | Four copies of a git wrapper with two different contracts lived across `state-check`, `state-brief`, `skills-export`, and `install-release`; one `git-cli` module with `runGit`/`gitText`/`gitAvailable` now backs all four. | `test/git-cli.test.mjs`; `test/module-surface.test.mjs`. |
| Detection must be mechanical; an eyeballed review missed a cross-file call with no import. | A dedupe removed `gitAvailable` from `state-brief` but left the call, and the commit shipped; the suite caught it, but only a `quality-audit` scan makes that class a standing gate. | `scripts/quality-audit.mjs`; `test/quality-audit.test.mjs`. |
| Memory artifacts must fail closed, not warn, once staleness or contradiction is measured. | An `ACTIVE` capsule 25+ commits behind HEAD returned `clean`, and lesson-gate resolution claimed in `validate` ran only in a separate command; both are now blocking errors (`stale-fixed-point` for COMPLETE, `active-without-next`, unresolved gates in `validate`). | `npm run test:state`; `npm run validate`. |
| A test that archives the committed HEAD can pass before the commit and fail after it. | `install-smoke` archives `HEAD`; the runtime-closure gate was uncommitted during the pre-commit run, so the suite was green, then failed on the committed tree. | `.github/workflows/validate.yml` runs the suites on the pushed commit; re-run `test:install`/`test:bootstrap` after committing shared-surface changes. |
