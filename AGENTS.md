# KRN Agent Skills

This private repository owns KRN's universal Codex engineering skills and
reusable process. Product repositories own their language, commands, and gates.

## Repository map

- `config/AGENTS.md` — the installed global safety and production core.
- `config/CLAUDE.md` — a symlink to the same semantic core.
- `skills/<group>/<name>/` — one promoted workflow and its direct resources.
- `skills/manifest.json` — names, install paths, invocation, and retirement.
- `evals/` — positive, negative, explicit, and composition routing cases.
- `scripts/` — deterministic validation, installation, hooks, and catalog tools.
- `CONTEXT.md` — the compact current system model and knowledge index.
- `docs/research/` — living source-backed synthesis, never raw research notes.
- `docs/adr/` — rare accepted decisions that still constrain the system.
- `docs/capabilities.md` and `docs/migration.md` — unique operator references.
- `.krn/runs/` — ignored resumable working state, never durable knowledge.

## Before editing

1. Run `git status --short --branch`; preserve unrelated work.
2. Read `config/AGENTS.md`, then `CONTEXT.md`.
3. Read only the affected skill and relevant research topic.
4. State the workflow owner, changed trigger or contract, and cheapest proof.

## Knowledge contract

- Condense current shared vocabulary and system relationships into `CONTEXT.md`.
  Rewrite it in place; Git history is the chronology.
- Merge source-backed knowledge into the canonical `docs/research/<topic>.md`.
  Extend an existing topic when its scope fits; create one only for a named
  future consumer. Keep claims beside provenance, limitations, and falsifiers.
- Record `docs/adr/<id>-<slug>.md` only for a surprising, consequential,
  hard-to-reverse trade-off. Routine implementation belongs in code.
- Keep prompts, logs, packets, shards, and restart capsules below
  `.krn/runs/<workflow>/<run-id>/`; remove them when their goal closes.
- Promote working material only when it has a named future consumer, one
  canonical semantic destination, and a cleanup or supersession rule.
- Never put a physical checkout or mount prefix into a reusable contract.

## Skill contract

- One repeated workflow has one owner and one public name.
- Put every installable skill at `skills/<group>/<name>/SKILL.md`.
- Keep frontmatter to `name` and `description`; put Codex invocation policy in
  `agents/openai.yaml` and front-load the distinct task plus nearest boundary.
- Keep common procedure in `SKILL.md`; point directly to branch-only material
  in `references/`. Add scripts only for fragile repeated deterministic work.
- Keep skill prose and scripts independent of the active shell wrapper;
  `config/AGENTS.md` owns injected global policy.
- README is the sole human skill catalog and links to canonical `SKILL.md` files. Do not
  maintain per-skill operator mirrors.
- Prefer positive steering. Delete aliases, duplicated procedure, stale
  references, compatibility sediment, and unused agents.

## Repository boundaries

- Do not vendor repositories, private course text, transcripts, or raw corpora.
- Never mirror a global workflow into a product repository. Local skills may
  add domain-only knowledge or compose the global owner without restating it.
- Do not mutate another repository or the installed index while reviewing.
- The installer may touch only manifest-declared paths and must back up
  displaced state.

## Verification

| Changed surface | Required signal |
|---|---|
| skill, metadata, manifest, reference, or routing | `npm run validate` plus the nearest fresh positive/negative prompt |
| setup, installer, migration, or hook behavior | focused tests plus shell syntax where applicable |
| final owned diff | relevant full suite once, then `git diff --check` |

Use Conventional Commits on an owned branch. Do not run untouched gates during
the inner loop.
