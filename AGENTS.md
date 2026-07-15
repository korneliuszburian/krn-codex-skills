# KRN Agent Skills

This private source repository owns KRN's universal Codex engineering skills
and reusable process. Product repositories own their domain language,
commands, and constraints.

## Repository Map

- `config/AGENTS.md` — installed global shell, safety, and production defaults.
- `skills/engineering/` — implicitly routed engineering workflow owners.
- `skills/advisory/` — explicit-only external challenge workflows.
- `skills/meta/` — skill authoring and pruning standards.
- `skills/manifest.json` — canonical names, paths, invocation, and migration scope.
- `evals/` — positive and negative routing cases.
- `scripts/` — deterministic validation and collision-safe installation.
- `docs/` — source provenance and migration ownership, never runtime memory.
- `README.md` and `CONTEXT.md` — operator overview and shared vocabulary.

## Before Editing

1. Run `rtk git status --short --branch` and preserve unrelated work.
2. Read `config/AGENTS.md`; it owns the universal shell, safety, and
   production-first defaults that this repository installs.
3. Read `CONTEXT.md`.
4. Read only the skill and source ledger relevant to the change.
5. State the workflow owner, trigger change, and cheapest credible proof.

## Skill Contract

- One workflow has one owner and one public name.
- Put every installable skill under `skills/<group>/<name>/SKILL.md`.
- Keep frontmatter to `name` and `description`.
- Put Codex invocation policy in `agents/openai.yaml`.
- Front-load descriptions with the distinct task and its boundary.
- Keep common steps in `SKILL.md`; disclose branch-only detail through a
  direct pointer into `references/`.
- Add scripts only for fragile or repeated deterministic work.
- Prefer positive instructions. Keep prohibitions for hard safety boundaries.
- Delete aliases, duplicated procedures, stale references, and unused agents.

## Repository Boundaries

- Do not vendor source repositories, private course text, transcripts, or raw
  research corpora. Record mechanisms and provenance in `docs/SOURCES.md`.
- Never copy or mirror a global workflow into a product repository. A local
  skill may add domain-only knowledge or compose a global owner without
  restating its procedure.
- Do not mutate another repository or the installed skill index while merely
  reviewing this repository.
- The installer may touch only paths named in `skills/manifest.json`; it must
  preserve displaced state in a backup.

## Verification

Run:

```bash
rtk npm run validate
rtk bash scripts/install.sh check
rtk git diff --check
```

Forward-test changed trigger descriptions with positive and negative prompts.
Use the smallest representative script smoke for changed deterministic tooling.
Use Conventional Commits on an owned branch.
