# KRN Agent Skills

This private repository owns KRN's universal Codex skills and reusable process.
Product repositories own their language, commands, and gates. The installed
contract is `config/AGENTS.md`; this file adds only facts true for this checkout.

## Repository map

- `config/AGENTS.md` — installed global contract; keep local facts out of it.
- `skills/<group>/<name>/` — one promoted workflow with its direct resources.
- `skills/manifest.json` — install names, paths, invocation, and retirement.
- `scripts/` — CLI, hooks, and `lib/<owner>/` (audit, catalog, conformance, contract, install, kernel, lessons, rules, state, support, ticket).
- `test/<group>/` — suites for architecture, audit, bootstrap-fixture, catalog, cli, conformance, contract, install, lane, lessons, opencode, repro, rules, state, support, and ticket, plus top-level `ci-workflow`, `hooks-guard`, `setup-workflow`, and `skill-scripts`.
- `.agents/skills/` — generated skill export; regenerate with `krn skills export`, gated by `skills:check`.
- `.github/` — CI workflow; `npm run gate` is the local equivalent of the gate sequence.
- `test/bootstrap-fixture/` — retained installed-release smoke.
- `CONTEXT.md` — current shared vocabulary and knowledge index.
- `docs/research/` — source-backed synthesis curated by its README.
- `docs/adr/` — earned, hard-to-reverse decisions.
- `docs/capabilities.md` — global capability profiles and evidence states.
- `docs/migration.md` — installation ownership, retirement, and rollback.
- `.krn/runs/` — ignored working state; durable artifacts never live there.
- `README.md` — operator entrypoint and human skill catalog.

## Working rules

1. Run `git status --short --branch` before editing; preserve unrelated work.
2. Read the affected `SKILL.md` and direct references; load research only when
   the decision depends on it. Consult `CONTEXT.md` when vocabulary may move.
3. Do not add per-skill mirrors; durable
   knowledge keeps one owner per artifact, defined by `CONTEXT.md` and the
   research curation contract.
4. Cross into another checkout through `$target-repo-work`; manage the installed
   index through `$managing-codex-capabilities` under its authority.
5. Never vendor private source material, raw corpora, or copied passages.
6. Reusable contracts never carry a physical checkout or mount prefix.
7. A merge commit that resolves a harness-surface conflict is itself a surface
   commit: it carries a `Change-contract: <unchanged check>:green->green`
   trailer, and the integrator runs the full gate on the merged fixed point.
8. A conflicted merge or rebase is continued, aborted, or committed only under
   the operator's authority; the composed upstream `resolving-merge-conflicts`
   procedure is guidance, not a mandate.
9. A merged branch is retired in the same close-out: delete it local and remote
   and remove its worktree (`gh pr merge --delete-branch`, or `git branch -D
   <branch>` + `git push origin --delete <branch>` + `git worktree remove
   <dir>`). Never leave a merged lane branch or worktree behind.

## Local gates

The global contract owns proof budgeting. `npm run gate` is the union of `gate:fast`
(cheap rejectors: validate, changes:check, quality:audit, test:lib,
conformance:check) and `gate:deep` (install, bootstrap, and seal suites). Run the
whole set once before handoff:

```bash
npm run validate
npm run test:bootstrap
npm run test:install
npm run test:hooks
npm run test:state
npm run test:skills
npm run skills:check
npm run lessons:verify
npm run quality:audit
npm run test:repro
npm run changes:check
npm run test:lessons
npm run test:lessons-verify
npm run test:change-contract
npm run test:conformance
npm run test:durable-pages
npm run test:catalog
npm run test:setup
npm run test:skill-scripts
npm run test:lib
npm run conformance:check
bash -n scripts/install.sh
bash -n skills/advisory/opencode-second-opinion/scripts/check-opinion.sh
bash -n skills/advisory/opencode-second-opinion/scripts/run-opinion.sh
git diff --check
```

Work on a branch you own; commit and publish only under explicit authority.
Installation, retirement, and rollback follow
`scripts/lib/install/install-release.mjs` and `docs/migration.md`.
