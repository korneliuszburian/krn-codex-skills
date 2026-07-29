# KRN Agent Skills

This private source repository owns KRN's universal Codex engineering skills
and reusable process. Product repositories own their domain language,
commands, and constraints.

## Repository Map

- `config/AGENTS.md` — one installed global shell, safety, and production core.
- `config/CLAUDE.md` — Claude symlink resolving to that same core without a copy.
- `skills/engineering/` — implicitly routed engineering workflow owners.
- `skills/advisory/` — explicit-only external challenge workflows.
- `skills/meta/` — skill authoring and pruning standards.
- `skills/manifest.json` — canonical names, paths, invocation, and migration scope.
- `evals/` — positive and negative routing cases.
- `scripts/` — deterministic validation and collision-safe installation.
- `docs/` — source provenance, migration ownership, and concise human operator
  pages; never agent runtime memory.
- `README.md` and `CONTEXT.md` — operator overview and shared vocabulary.

## Before Editing

1. Run `git status --short --branch` and preserve unrelated work.
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
- Keep reusable skill prose and script internals independent of the active
  shell-command wrapper; `config/AGENTS.md` owns that injected policy.
- Resolve persisted workflow artifacts through the repository's
  `docs/agents/artifact-paths.json`; a physical checkout or mount prefix is
  never part of a reusable skill contract.
- Give every promoted skill one concise `docs/<group>/<name>.md` operator page
  linked from the manifest-driven README. `SKILL.md` remains the sole workflow
  procedure; the human page summarizes use, boundary, inputs, output, and
  composition without copying its steps.
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

Select proof by changed surface:

| Changed surface | Required signal |
|---|---|
| skill, metadata, manifest, or direct pointer | `npm run validate` |
| installer or migration behavior | isolated install/collision smoke plus `bash -n scripts/install.sh` |
| trigger description or composition | one fresh positive and nearest negative prompt |
| final owned diff | `git diff --check` before commit |

Do not run untouched rows during the inner loop. Run the full relevant set once
before publishing a release-sized catalog change. Use Conventional Commits on
an owned branch.
