# Memory register

This page is the control plane over repository memory: one row per tracked
artifact, naming who writes it, who reads it, what delivers it, what bounds it,
and what would falsify the row. The observer
`scripts/lib/memory-register.mjs` enumerates artifacts from the git index and
fails closed when an artifact has no row, a row has no artifact, two rows claim
one artifact, or a field is missing, unknown, retired with a trigger, pointed
at a dead reader, unproven, over budget, stale, or blind.

Status: `accepted`. Consumer: maintainer and `$setup-repository-workflow`. Owner: maintainer. Verified: 2026-09-19.

Row grammar and the nine columns:

- `Artifact` is a path or glob resolved against the git index, never the
  filesystem. The observer reads `git ls-files -z --cached`, so a file that is
  not tracked is not registered and a tracked file cannot escape a row.
- `Kind` is one of `durable`, `config`, `derived`, `working`, or `code`.
- `Trigger` is a delivery cue: `session-start`, `path:<glob>`, `symbol:<name>`,
  `churn:<glob>`, `manual:<reason>`, or `never`; entries are separated by `;`.
  Any entry parsed as a path glob is read by the recall ladder; `manual:` and
  `never` are recorded but not auto-delivered.
- `Falsifier` is the executable proof in the lesson grammar
  `test/<file>.mjs::<case>@<7-hex>`; the named suite is the one that must fail
  when the row's claim stops holding.
- `Verified` is `<7-hex>@<YYYY-MM-DD>`, the commit and date of the last
  evidence check. The observer flags a row whose mapped sources changed after
  its anchor and whose falsifier anchor drifted without re-verification.
- A row with no honest reader names `none`; the observer reports the
  `reader-unexercised` warning rather than inventing a consumer.

## Register

| Artifact | Kind | Writer | Reader | Trigger | Budget | Falsifier | Status | Verified |
|---|---|---|---|---|---|---|---|---|
| AGENTS.md | durable | maintainer | every agent session | session-start | unbounded | test/rules/gate-list-drift.test.mjs::the handoff gate list names every step of the gate script@7f0e44b | active | 7f0e44b@2026-09-19 |
| CONTEXT.md | durable | maintainer | `$domain-modeling` and maintainer | session-start | unbounded | test/rules/durable-pages.test.mjs::an accepted ADR missing from the knowledge map is reported@7f0e44b | active | 7f0e44b@2026-09-19 |
| README.md | durable | maintainer | operators and contributors | session-start | unbounded | test/rules/content-rules.test.mjs::readmeSkillsTableErrors accepts a canonical table and reports gaps@7f0e44b | active | 7f0e44b@2026-09-19 |
| package.json | config | maintainer | `scripts/validate.mjs` and npm gates | path:package.json | unbounded | test/ci-workflow-tiers.test.mjs::gate:fast runs the cheap rejector gates@7f0e44b | active | 7f6084c@2026-09-19 |
| .* | config | maintainer | the toolchain and CI | manual:reopened when a toolchain pin or ignore rule changes | unbounded | test/ci-workflow.test.mjs::the declared Node engine floor excludes the EOL Node 20 line@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/README.md | derived | maintainer | `$source-to-decision` and maintainer | path:docs/research/** | unbounded | test/rules/durable-pages.test.mjs::a corrupted research index title is reported@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/orchestration.md | durable | maintainer | `$delivery-loop` and maintainer | path:docs/research/orchestration.md; symbol:delivery-loop | unbounded | test/rules/pass-trigger.test.mjs::ADR 0005 names the observer of record and its inputs@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/workflow-lessons.md | derived | maintainer | `$delivery-loop` and `$source-to-decision` | path:docs/research/workflow-lessons.md | unbounded | test/lessons/lessons.test.mjs::parseLessons owns the row schema and reports malformed rows@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/ticket-protocol.md | durable | maintainer | `$slice-work` and `$wayfinder` | path:docs/research/ticket-protocol.md; symbol:ticket | unbounded | test/ticket/ticket.test.mjs::the ticket module parses the abi and exposes check and frontier@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/lab-tests.md | durable | maintainer | `$delivery-loop` and maintainer | path:docs/research/lab-tests.md | unbounded | test/rules/lt-registry.test.mjs::the lab-test registry parses to numbered rows@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/frontend-delivery.md | durable | maintainer | `$frontend-architecture` | path:docs/research/frontend-delivery.md | unbounded | test/frontend/frontend.test.mjs::inventoryTheme reads the layers, variants, tokens, and ACF layouts@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/harness-gap-register.md | durable | maintainer | none | manual:reopened when a mechanism status or a recorded failure changes | unbounded | test/rules/memory-register.test.mjs::the repository register has no structural errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/mattpocock-skills-deep-audit.md | durable | maintainer | none | manual:reopened when the upstream pin or a candidate changes | unbounded | test/rules/skill-rules.test.mjs::referenceLinkErrors requires each reference to be linked@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/typed-judgement-and-model-landscape.md | durable | maintainer | none | manual:reopened when the operator names a first consumer with a falsifier | unbounded | test/rules/memory-register.test.mjs::the repository register has no structural errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/unlazy-codex-port.md | durable | maintainer | none | manual:kept as design evidence pending a measured second consumer | unbounded | test/rules/memory-register.test.mjs::the repository register has no structural errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/unslop-codex-port.md | durable | maintainer | none | manual:reopened by a blinded pilot or a real consumer | unbounded | test/rules/memory-register.test.mjs::the repository register has no structural errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/research/memory-register.md | durable | maintainer | `$setup-repository-workflow` and maintainer | path:docs/research/memory-register.md; session-start | unbounded | test/rules/memory-register.test.mjs::the repository register has no structural errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/adr/*.md | durable | maintainer | maintainer and agents | path:docs/adr/** | unbounded | test/rules/durable-pages.test.mjs::an accepted ADR missing from the knowledge map is reported@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/prd/*.md | working | maintainer | `$wayfinder` and `$slice-work` | manual:consumed by the assigned worker then deleted | unbounded | test/rules/stale-references.test.mjs::the durable surface cites no unrecorded stale reference@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/capabilities.md | durable | maintainer | maintainer and `$managing-codex-capabilities` | manual:reconciled when a catalog schema or runtime event changes | unbounded | test/rules/durable-pages.test.mjs::a complete durable surface reports no errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| docs/migration.md | durable | maintainer | `$managing-codex-capabilities` and operators | manual:reopened when the installer target or host layout changes | unbounded | test/rules/durable-pages.test.mjs::a complete durable surface reports no errors@7f0e44b | active | 7f0e44b@2026-09-19 |
| config/** | config | maintainer | `$managing-codex-capabilities` and `scripts/validate.mjs` | path:config/** | unbounded | test/contract/upstream-sources.test.mjs::upstreamSourceErrors accepts a canonical document@7f0e44b | active | 7f0e44b@2026-09-19 |
| .github/** | config | maintainer | CI | path:.github/** | unbounded | test/ci-workflow.test.mjs::every gate named in AGENTS.md runs in the workflow@7f0e44b | active | 7f0e44b@2026-09-19 |
| scripts/*.mjs | code | maintainer | operators and CI | path:scripts/*.mjs | unbounded | test/rules/gate-list-drift.test.mjs::the handoff gate list names no step the gate script does not run@7f0e44b | active | 7f0e44b@2026-09-19 |
| scripts/lib/** | code | maintainer | `scripts/validate.mjs` and the gates | path:scripts/lib/** | unbounded | test/audit/quality-audit.test.mjs::the repository itself passes the quality audit@7f0e44b | active | 7f6084c@2026-09-19 |
| scripts/lane/** | code | maintainer | the AFK lane | path:scripts/lane/** | unbounded | test/lane/runner-contract.test.mjs::the lane family is admitted into the repository@7f0e44b | active | 7f6084c@2026-09-19 |
| scripts/hooks/** | code | maintainer | Codex and opencode hooks | path:scripts/hooks/** | unbounded | test/hooks-guard.test.mjs::apply_patch move into a protected path is denied@7f0e44b | active | 7f0e44b@2026-09-19 |
| scripts/install.sh | code | maintainer | the installer and release checks | path:scripts/install.sh | unbounded | test/contract/runtime-closure-installsh.test.mjs::the repository manifest retires scripts/install.sh and stays clean@7f0e44b | active | 7f0e44b@2026-09-19 |
| skills/** | code | maintainer and `$managing-codex-capabilities` | `$setup-repository-workflow` and agents | path:skills/** | unbounded | test/rules/skill-rules.test.mjs::skillLayoutErrors and skillIdentityErrors enforce directory shape@7f0e44b | active | 7f0e44b@2026-09-19 |
| .agents/skills/** | derived | `scripts/lib/install/skills-export.mjs` | Codex and opencode sessions | manual:regenerated by krn skills export | unbounded | test/install/skills-export-marker.test.mjs::checkSkills warns marker-behind when commits under skills/** land after the marker@7f0e44b | active | 7f0e44b@2026-09-19 |
| test/** | code | maintainer | the gate suites | path:test/** | unbounded | test/audit/quality-audit-gate.test.mjs::test:lib still covers the audit library and its observers@7f0e44b | active | 7f6084c@2026-09-19 |

## Exclusions

A tracked file matching an exclusion is outside the register's claim surface and
needs no row. An exclusion pattern that matches no tracked artifact is a
`blind-exclusion` warning, so stale exclusions stay visible without blocking a packaged source snapshot.

| Pattern | Reason | Owner | Falsifier | Verified |
|---|---|---|---|---|
| .krn/runs/** | ignored working run state: capsules, boundary pages, and logs are erased with the run and are never durable | maintainer | reviewed with each run removal | 2026-09-19 |
| .scratch/** | git-excluded local ticket queue: owned and validated by the ticket suites, not durable memory | maintainer | `npm run test:lib` | 2026-09-19 |
| test/bootstrap-fixture/project/LOCAL.md | foreign fixture page owned by the bootstrap fixture and kept byte-identical | maintainer | test/bootstrap-fixture/bootstrap.test.mjs | 2026-09-19 |
| LICENSE | static legal text with no writer, reader, or delivery trigger | maintainer | reviewed when the license changes | 2026-09-19 |
| NOTICE | static attribution text with no writer, reader, or delivery trigger | maintainer | reviewed when attribution changes | 2026-09-19 |

Reopen when: a tracked artifact has no row or two, a row loses a field, a reader
or falsifier stops resolving, a mapped source changes after its verification, or
the git index gains a root the rows do not partition.
