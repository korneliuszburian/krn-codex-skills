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
