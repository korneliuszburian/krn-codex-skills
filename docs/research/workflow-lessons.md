# Workflow lessons

Status: `accepted`. Consumer: `$delivery-loop` at outcome bind. Owner: the lifecycle writer. Verified: 2026-09-11.

Cross-run workflow memory: the file-backed port of the Agents SDK `Memory()`
pattern. Each row is a reusable process lesson with the evidence that earned it
and the gate or owner that enforces it; case-specific findings stay in reviewed
artifacts. Bounded at 24 rows: displace or condense before adding.

Each row may carry a fourth `Occurrences` column of `YYYY-MM-DD@<7-hex>`
tokens naming each witnessed instance. Two or more occurrences whose gate is not
structural fail `lessons:check` until the friction is consolidated into a
script or test path, and a recurring class keeps one row that supersedes its
duplicates. A recurring row must also carry a fifth `Falsifier` column,
`<test>/<file>.mjs::<case>@<7-hex>`: the check observed failing on the
pre-change behavior and the commit that recorded it. `lessons:check` verifies
the file exists and, in a git checkout, that the commit is an ancestor of HEAD,
so a gate whose proof is missing or unreachable file fails closed; a proof
commit absent from this checkout is treated as provenance and is not
ancestry-checked (see `orchestration.md`).
`lessons:check` fails a triggered row closed as `stale-anchor` when the proof
commit predates later changes to the falsifier file or a resolved enforcing
gate file, and warns for an
untriggered row, and `lessons:verify` re-runs each named case: a failing case, or
a pattern that matches no test, fails the command. A recurrence recorded after
the proof commit fails closed as a gate that did not stick: the friction came
back, so the lesson is strengthened or split into a distinct class.

A row may carry a sixth `Trigger` column of `path:<glob>`, `symbol:<name>`, or
`churn:<glob>` entries. Delivery is harness-evaluated, not left to the reader:
`krn-codex memory recall --changed <paths>` and `--symbol <names>` return every
lesson whose trigger matches (a `symbol:` trigger is evaluated against the
commit's changed line ranges by `changes check`, while `memory recall --symbol`
matches names you pass explicitly, and a `churn:` trigger fires when a
changed file matching the glob was touched at least twice before this commit),
and `changes check` requires a matching surface change to reconstruct the lesson
with a `Recall: <gate or falsifier> => <changed file or symbol>` trailer, so the
lesson must be bound to the present change instead of replayed from the page.
When the recalled lesson's gate or falsifier is an executable test, that test
must also appear among the change's declared `Change-contract`/`At-risk` checks,
so the recall is exercised rather than decorative.

A row may carry a seventh `Status` column. A retired row is archived as
`retired@<7-hex>` and must either name `superseded-by:<anchor>` that resolves to
an active row, or have no live gate left (its enforcement was removed); retired
rows are excluded from trigger delivery and do not consume the 24-row active
budget, so aging is explicit instead of a silent deletion.

| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |
|---|---|---|---|---|---|---|
| Derive the installed runtime closure from the artifact being installed, never from the running installer version. | A release silently omitted `state-brief.mjs` and still reported `filesystem_installed`. | `runtime_paths` in `skills/manifest.json`, the post-switch CLI smoke, and `test/install-smoke.test.mjs`. |
| Treat model-stated references as unverified; deterministic artifacts are authoritative. | A low-effort review misquoted a base commit SHA before self-correcting. | `config/AGENTS.md` proof rule; `manual:review` at the fixed point. |
| Prefer proactive capsule rewrites at boundaries over window-limit autocompact. | Context-rot and compaction studies plus official harness guidance. | `skills/engineering/delivery-loop/SKILL.md` step 3; `test/state-check.test.mjs`. |
| Commission review from a context that did not produce the change. | Self-preference and self-correction research, and the low-effort imitation probe. | `manual:review`; `test/composition.test.mjs`. |
| A budgeted surface accepts a new rule only after displacing or condensing existing text. | `config/AGENTS.md` carries a 620-word / 320-char information budget; an earlier `delivery-loop/SKILL.md` reached 181 lines under a since-removed 180-line cap and passed only after condensing to 179. | `scripts/validate.mjs` (the contract budget). |
| Render CLI diagnostics as text, never raw objects. | `krn-codex state check` printed `warning: [object Object]` for the first structured warning. | The readable-warning test in `test/state-check.test.mjs`. |
| A new falsifier must be shown failing on the pre-change or mutated behavior before it counts. | Mutation-testing benchmarks show LLM-authored suites detect a minority of mutants, and the first structured CLI warning broke only after a probe. | The proof rule in `config/AGENTS.md` and the fixed-point review gate. |
| Blocking errors must be visible in human command output, not only in the exit code. | A composition probe showed `state resume` exiting 1 on `lessons-over-budget` while printing no reason. | The blocking-errors brief test in `test/state-brief.test.mjs`. |
| A prose rule that no check enforces is ignored at low effort. | The explicit-only rule was ignored by a low-effort model until it was narrowed and behaviorally checked; per-slice and held-out rules now have a test/inspection gate. | `manual:review`; `scripts/lib/lessons.mjs`. |
| Hand-written capsule fixed points must use full commit tokens. | A hand-filled capsule with short hashes failed `state check` with `invalid-fixed-point` until the full tokens were used. | `test/state-check.test.mjs`. |
| Verification lanes on this host cannot spawn git children, so state tests run only in the main session. | Two independent luna reviews reported `spawnSync git EPERM` and could not execute `test:state`; each stated the execution gap instead of claiming a regression. | `manual:review`; `scripts/lib/state-check.mjs`. |
| A read-only review cannot prove runtime reachability; every extracted runtime module needs at least one executing test, and mechanical detection must back the class. | The extraction at `83101ae` left `derivedRolloutDay` calling an unexported `isValidDay`, and a later dedupe at `f40286d` removed `gitAvailable` from `state-brief` but left the call; luna reported no finding both times and only an executing test or the quality audit surfaced it. | `scripts/quality-audit.mjs`; `test/catalog-usage-scan.test.mjs`; `test/quality-audit.test.mjs`. | 2026-09-11@83101ae, 2026-09-11@f40286d | `test/quality-audit.test.mjs::the audit catches a cross-file call that is never imported@5dac423` |
| Broadening executing coverage can expose silently lost records that a green suite hides. | The manifest-name quarantine passed `family@marketplace` as the id, so the collector filtered it: the plugin was skipped and `hardQuarantine` kept no record until the plugin-cache integration test exercised the branch. | `test/catalog-inventory-quarantine-branches.test.mjs`. |
| Duplicated low-level adapters drift; centralize once and alias at call sites. | Four copies of a git wrapper with two different contracts lived across `state-check`, `state-brief`, `skills-export`, and `install-release`; one `git-cli` module with `runGit`/`gitText`/`gitAvailable` now backs all four. | `test/git-cli.test.mjs`; `test/module-surface.test.mjs`. | | `test/git-cli.test.mjs::runGit returns trimmed output inside a repo and fails safely outside@1a2e74d` | symbol:runGit |
| An AST or diff helper must be tested against real git output or the exact spec, because a lenient fake hides path-prefix bugs. | `symbol:` delivery returned `[]` for every real commit while the unit fakes passed, since `git show sha:b/<path>` was never asserted; normalizing the `a/`/`b/` header prefix fixed it. | `test/symbol-triggers.test.mjs` (strict `git show` specs) and `scripts/lib/symbol-triggers.mjs`. | 2026-09-11@5631844 | | |
| A test that drives a guarded gate must clear the ambient recursion guard. | The end-to-end memory test inherited `KRN_CHANGE_CONTRACT=0` when `changes check` ran `test:lib`, so its nested `changes check` short-circuited and turned `main` CI red while passing locally. | `test/guard-inheritance.test.mjs` and `test/integration-memory.test.mjs`. |
| Machine-readable git output must be parsed NUL-safe (`-z`) or with `core.quotePath=false` plus C-unescaping, because git quotes non-ASCII, control, and `"`/`\` paths and a text split then misses them. | A non-ASCII `scripts/lib/*.mjs` path and a `we"ird.mjs` diff header both defeated `changes check` and `symbol:` delivery silently (`errors: []`), bypassing the change contract. | `test/change-contract.test.mjs` (quoted-path falsifier) and `test/symbol-triggers.test.mjs` (C-quoted header). | 2026-09-11@9fb15da | | |
| Memory artifacts must fail closed, not warn, once staleness or contradiction is measured. | An `ACTIVE` capsule 25+ commits behind HEAD returned `clean`, and lesson-gate resolution claimed in `validate` ran only in a separate command; both are now blocking errors (`stale-fixed-point` for COMPLETE, `active-without-next`, unresolved gates in `validate`). | `npm run test:state`; `npm run validate`. |
| A test that archives the committed HEAD can pass before the commit and fail after it. | `install-smoke` archives `HEAD`; the runtime-closure gate was uncommitted during the pre-commit run, so the suite was green, then failed on the committed tree. | `.github/workflows/validate.yml` runs the suites on the pushed commit; re-run `test:install`/`test:bootstrap` after committing shared-surface changes. |
| A harness change must carry a falsifiable prediction at the commit that makes it. | The same friction class was re-fixed within 7–8 minutes three times with no recorded prediction, and a green pre-commit suite hid a post-commit failure. | The `Change-contract:` trailer and `npm run changes:check`. |
