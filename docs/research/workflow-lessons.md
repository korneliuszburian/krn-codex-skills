# Workflow lessons

Status: `accepted`. Consumer: `$delivery-loop` at outcome bind. Owner: the lifecycle writer. Verified: 2026-09-13.

Cross-run workflow memory: the file-backed port of the Agents SDK `Memory()`
pattern. Each row is a reusable process lesson with the evidence that earned it
and the gate or owner that enforces it; case-specific findings stay in reviewed
artifacts. Bounded at 24 rows: displace before adding (add the replacement row, then retire the displaced row with `retired@<sha>`); a reworded row reads as a deletion to `lesson-shrinkage`, which preserves exact prose against context collapse.

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
commit predates later changes to the falsifier file or to a `path:` enforcing
gate file; an npm-script or `manual:` gate is not resolved to the files its
command runs, so drift there is not detected, and it warns for an
untriggered row, and `lessons:verify` re-runs each named case: a failing case, or
a pattern that matches no test, fails the command. A recurrence recorded after
the proof commit fails closed as a gate that did not stick: the friction came
back, so the lesson is strengthened or split into a distinct class.
`krn-codex lessons reanchor --root .` re-runs each stale case and bumps an anchor only
when the named case stays green, so drift is confirmed rather than blessed.

A row may carry a sixth `Trigger` column of `path:<glob>`, `symbol:<name>`, or
`churn:<glob>` entries. Delivery is harness-evaluated, not left to the reader:
`krn-codex memory recall --root . --changed <paths>` and `--symbol <names>` return every
lesson whose trigger matches (a `symbol:` trigger is evaluated against the
commit's changed line ranges by `changes check`, while `memory recall --symbol`
matches names you pass explicitly, and a `churn:` trigger fires when a
changed file matching the glob was touched at least twice before this commit),
and `changes check` reports a matching surface change that does not reconstruct the lesson (advisory by default; `--strict-recall` makes it blocking)
with a `Recall: <gate or falsifier> => <changed file or symbol>` trailer, so the
lesson must be bound to the present change instead of replayed from the page.
When the recalled lesson's gate or falsifier is an executable test, `changes
check` reports (advisory by default; `--strict-recall` requires) that test among
the change's declared `Change-contract`/`At-risk` checks, so the recall is
exercised rather than decorative.

A row may carry a seventh `Status` column. A retired row is archived as
`retired@<7-hex>` and must either name `superseded-by:<anchor>` that resolves to
an active row, have no live gate left (its enforcement was removed), or name
`enforced-by:<gate-ref>` for one of its exact existing structural gates. A
structural gate is an npm script, a resolved `.mjs`, `.js`, `.cjs`, `.sh`, or
`.py` command file directly under `scripts/`, a resolved `*.test.*` or
`*.spec.*` file under `test/`, or a resolved YAML workflow under
`.github/workflows/`. Prose, fixture files, helper modules, other configuration
files, and manual checks do not qualify. The checker resolves this reference on each run.
Retired rows are excluded from trigger delivery and do not consume the 24-row
active budget, so aging is explicit instead of a silent deletion.

| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |
|---|---|---|---|---|---|---|
| Derive the installed runtime closure from the artifact being installed, never from the running installer version. | A release silently omitted `state-brief.mjs` and still reported `filesystem_installed`. | `runtime_paths` in `skills/manifest.json`, the post-switch CLI smoke, and `test/install/install-smoke.test.mjs`. | | | path:scripts/lib/install/**; path:skills/manifest.json | |
| Treat model-stated references as unverified; deterministic artifacts are authoritative. | A low-effort review misquoted a base commit SHA before self-correcting. | `config/AGENTS.md` proof rule; `manual:review` at the fixed point. |
| Prefer proactive capsule rewrites at boundaries over window-limit autocompact. | Context-rot and compaction studies plus official harness guidance. | `skills/engineering/delivery-loop/SKILL.md` step 3. |
| Commission review from a context that did not produce the change. | Self-preference and self-correction research, and the low-effort imitation probe. | `manual:review` at the fixed point. |
| A budgeted surface accepts a new rule only after displacing or condensing existing text. | `config/AGENTS.md` carries a 620-word / 320-char information budget; an earlier `delivery-loop/SKILL.md` overshot its then line budget and passed only after condensing to 179. | `scripts/validate.mjs` (the contract budget). |
| Render CLI diagnostics as text, never raw objects. | `krn-codex state check` printed `warning: [object Object]` for the first structured warning. | The readable-warning test in `test/state/state-check.test.mjs`. |
| A new falsifier must be shown failing on the pre-change or mutated behavior before it counts. | Mutation-testing benchmarks show LLM-authored suites detect a minority of mutants, and the first structured CLI warning broke only after a probe. | The proof rule in `config/AGENTS.md` and the fixed-point review gate. |
| Blocking errors must be visible in human command output, not only in the exit code. | A composition probe showed `state resume` exiting 1 on `lessons-over-budget` while printing no reason. | The blocking-errors brief test in `test/state/state-brief.test.mjs`. |
| A prose rule that no check enforces is ignored at low effort. | The explicit-only rule was ignored by a low-effort model until it was narrowed and behaviorally checked; per-slice and held-out rules now have a test/inspection gate; the ticket ABI's `Scope` field was equally inert, so the sh-1 lane added `skills/manifest.json` while Scope named four other paths, until `krn-codex ticket check --id --base` made it structural (`scope-undeclared`). | `manual:review`; `scripts/lib/lessons/lessons.mjs`; `test/ticket/ticket-scope.test.mjs`. | 2026-09-16@082b237 | `test/ticket/ticket-scope.test.mjs::checkTickets reports changed files outside the ticket Scope@5dc2974` | |
| Hand-written capsule fixed points must use full commit tokens. | A hand-filled capsule with short hashes failed `state check` with `invalid-fixed-point` until the full tokens were used. | `test/state/state-check.test.mjs`. |
| Verification lanes on this host cannot spawn git children, so state tests run only in the main session. | Two independent luna reviews reported `spawnSync git EPERM` and could not execute `test:state`; each stated the execution gap instead of claiming a regression. | none. | | | | retired@bcba2a5 |
| A declared base red must be a real assertion failure: a module-load error is a setup error, and a check that already passes is not a flip. | The sh-2 lane declared a new observer whose base failure was a missing export (refused as `before-state-unverified`), and the sh-8 suite was green at base until a case asserted the legacy files' removal (refused as `before-state-not-red`); both tickets now carry the constraint. | The lane preflight and worker gate in the lab runner; `frozenRedOk` in `scripts/lib/contract/change-contract-runs.mjs`; `test/contract/change-contract.test.mjs`. | 2026-09-16@082b237, 2026-09-16@4ce02d1 | `test/contract/change-contract.test.mjs::verifyBefore requires the declared check to be red at base@bb6c77f` | symbol:frozenRedOk |
| A read-only review cannot prove runtime reachability; every extracted runtime module needs at least one executing test, and mechanical detection must back the class. | The extraction at `83101ae` left `derivedRolloutDay` calling an unexported `isValidDay`, and a later dedupe at `f40286d` removed `gitAvailable` from `state-brief` but left the call; luna reported no finding both times and only an executing test or the quality audit surfaced it. | `scripts/quality-audit.mjs`; `test/catalog/catalog-usage-scan.test.mjs`; `test/audit/quality-audit.test.mjs`. | 2026-09-11@83101ae, 2026-09-11@f40286d | `test/audit/quality-audit.test.mjs::the audit catches a cross-file call that is never imported@508ba28` |
| Broadening executing coverage can expose silently lost records that a green suite hides. | The manifest-name quarantine passed `family@marketplace` as the id, so the collector filtered it: the plugin was skipped and `hardQuarantine` kept no record until the plugin-cache integration test exercised the branch. | `test/catalog/catalog-inventory-quarantine.test.mjs`. |
| Duplicated low-level adapters drift; centralize once and alias at call sites. | Four copies of a git wrapper with two different contracts lived across `state-check`, `state-brief`, `skills-export`, and `install-release`; one `git-cli` module with `runGit`/`gitText`/`gitAvailable` now backs all four. | `test/support/git-cli.test.mjs`. | | `test/support/git-cli.test.mjs::runGit returns trimmed output inside a repo and fails safely outside@8f67f21` | |
| An AST or diff helper must be tested against real git output or the exact spec, because a lenient fake hides path-prefix bugs. | `symbol:` delivery returned `[]` for every real commit while the unit fakes passed, since `git show sha:b/<path>` was never asserted; normalizing the `a/`/`b/` header prefix fixed it. | `test/support/symbol-triggers.test.mjs` (strict `git show` specs) and `scripts/lib/kernel/js.mjs`. | 2026-09-11@5631844 | | |
| A test that drives a guarded gate must clear the ambient recursion guard. | The end-to-end memory test inherited `KRN_CHANGE_CONTRACT=0` when `changes check` ran `test:lib`, so its nested `changes check` short-circuited and turned `main` CI red while passing locally. | `test/contract/guard-inheritance.test.mjs` and `test/contract/integration-memory.test.mjs`. |
| Machine-readable git output must be parsed NUL-safe (`-z`) or with `core.quotePath=false` plus C-unescaping, because git quotes non-ASCII, control, and `"`/`\` paths and a text split then misses them. | A non-ASCII `scripts/lib/*.mjs` path and a `we"ird.mjs` diff header both defeated `changes check` and `symbol:` delivery silently (`errors: []`), bypassing the change contract. | `test/contract/change-contract.test.mjs` (quoted-path falsifier) and `test/support/symbol-triggers.test.mjs` (C-quoted header). | 2026-09-11@9fb15da | | |
| Memory artifacts must fail closed, not warn, once staleness or contradiction is measured. | An `ACTIVE` capsule 25+ commits behind HEAD returned `clean`, and lesson-gate resolution claimed in `validate` ran only in a separate command; the same staleness now blocks a COMPLETE capsule and warns on an ACTIVE one (`stale-fixed-point`), and `active-without-next` plus unresolved gates in `validate` are blocking errors. | `npm run test:state`; `npm run validate`. | | | path:scripts/lib/lessons/** |
| A test that archives the committed HEAD can pass before the commit and fail after it. | `install-smoke` archives `HEAD`; the runtime-closure gate was uncommitted during the pre-commit run, so the suite was green, then failed on the committed tree. | `.github/workflows/validate.yml` runs the suites on the pushed commit; re-run `test:install`/`test:bootstrap` after committing shared-surface changes. |
| A harness change must carry a falsifiable prediction at the commit that makes it. | The same friction class was re-fixed within 7–8 minutes three times with no recorded prediction, and a green pre-commit suite hid a post-commit failure. | The `Change-contract:` trailer and `npm run changes:check`. | | | churn:scripts/lib/contract/change-contract.mjs |
| A block's styles belong in the block's own file; a section file must not define another block's classes. | A model built `courses.css` containing `.card`, `.card__media`, `.card__badge` and the like while `blocks.md` marked `card` built, and the audit still reported clean. | The `block-ownership` rule in scripts/lib/frontend/theme.mjs and test/frontend/frontend.test.mjs. | | | | retired@15307d8 |
| Facts must be machine-checked against the code: a registry row marked `built` or `verified` needs its own file. | `card` was marked built with no `src/css/blocks/card.css`; the `facts-registry` rule and its frozen conformance case now fail that row. | `frontend audit --docs`, the `frontend-audit-catches-facts-registry-drift` conformance case, and test/frontend/frontend.test.mjs. | | | | retired@15307d8 |
| A `data-*` variant is either shared library vocabulary or `data-<block>-`, and its value must exist in the theme or the library. | A model used `data-state`, invented `data-view`, and passed `data-button-variant="primary"` although the default button carries no attribute and the library defines only `link` and `inverse`. | The `variant-naming` and `template-variant` rules in scripts/lib/frontend/theme.mjs with test/frontend/frontend.test.mjs. | | | | retired@15307d8 |
| A shipped boilerplate's existing blocks may violate the stage's policy; treat them as findings, never as precedent. | `site-head`, `site-foot`, `recursive-grid`, and `hero` carried `min-block-size` floors and unprefixed attributes, so the project registered four `--accept` entries instead of copying the pattern. | The `block-height` and `variant-naming` rules in scripts/lib/frontend/theme.mjs with test/frontend/frontend.test.mjs; the project's `--accept` list is the recorded exception. | | | | retired@15307d8 |

<!-- reanchor: duplicated-adapter proof re-anchored after the exact-surface change; see docs/research/workflow-lessons.md row. -->
