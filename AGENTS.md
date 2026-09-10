# KRN Agent Skills

This private repository owns KRN's universal Codex engineering skills and
reusable process. Product repositories own their language, commands, and gates.
This file is the source-repository adapter; the installed stable policy lives in
`config/AGENTS.md`.

## Repository map

- `config/AGENTS.md` — the installed global safety and production core.
- `skills/<group>/<name>/` — one promoted workflow and its direct resources.
- `skills/manifest.json` — names, install paths, invocation, and retirement.
- `test/` — the one retained public bootstrap smoke fixture.
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
4. State the workflow owner, changed seam or contract, authority, and cheapest proof.

## Knowledge contract

- Condense current shared vocabulary and system relationships into `CONTEXT.md`.
  Rewrite it in place; Git history is the chronology.
- Merge source-backed knowledge into the canonical `docs/research/<topic>.md`.
  Extend an existing topic when its scope fits; create one only for a named
  future consumer. Keep claims beside provenance, limitations, and falsifiers.
- Record `docs/adr/<id>-<slug>.md` only for a surprising, consequential,
  hard-to-reverse trade-off. Routine implementation belongs in code.
- Keep workflow-owned prompts, logs, packets, and shards below
  `.krn/runs/<workflow>/<run-id>/`. Keep the one outcome restart capsule only at
  `.krn/runs/delivery-loop/<outcome-id>/state.md`; `$delivery-loop` owns it and
  removes it at its lifecycle cleanup trigger.
- Promote working material only when it has a named future consumer, one
  canonical semantic destination, and a cleanup or supersession rule.
- Never put a physical checkout or mount prefix into a reusable contract.

## Repository boundaries

Do not vendor private source material or raw corpora. Do not mutate another
repository or the installed index while reviewing. The installer may touch only
manifest-declared paths and must back up displaced state.

## Local gates

The global contract owns proof budgeting. Before handoff, run the local command
set once: `npm run validate`, `npm run test:bootstrap`, `npm run test:hooks`,
`bash -n scripts/install.sh`, and `git diff --check`.

Use Conventional Commits on an owned branch. Do not run untouched gates during
the inner loop.
