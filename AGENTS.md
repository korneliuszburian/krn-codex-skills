# KRN Agent Skills

This private repository owns KRN's universal Codex skills and reusable process.
Product repositories own their language, commands, and gates. The installed
contract is `config/AGENTS.md`; this file adds only facts true for this checkout.

## Repository map

- `config/AGENTS.md` — installed global contract; keep local facts out of it.
- `skills/<group>/<name>/` — one promoted workflow with its direct resources.
- `skills/manifest.json` — install names, paths, invocation, and retirement.
- `scripts/` — deterministic validation, installation, hooks, and catalog tools.
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
3. Do not add status files, progress logs, or per-skill mirrors; durable
   knowledge keeps one owner per artifact, defined by `CONTEXT.md` and the
   research curation contract.
4. Cross into another checkout through `$target-repo-work`; manage the installed
   index through `$managing-codex-capabilities` under its authority.
5. Never vendor private source material, raw corpora, or copied passages.
6. Reusable contracts never carry a physical checkout or mount prefix.

## Local gates

The global contract owns proof budgeting. Run this set once before handoff:

```bash
npm run validate
npm run test:bootstrap
npm run test:hooks
npm run test:state
npm run test:skills
bash -n scripts/install.sh
git diff --check
```

Work on a branch you own; commit and publish only under explicit authority.
Installation, retirement, and rollback follow
`scripts/lib/install-release.mjs` and `docs/migration.md`.
