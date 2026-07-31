# AGENTS.md composition

AGENTS.md is an always-loaded standing brief, so it must stay thin. Two layers
compose automatically — keep them separate.

## How the harness composes AGENTS.md

Codex (and CLAUDE.md for Claude Code) build the brief at session start by walking
the filesystem, not by reading one file:

1. **Global first** — `~/.codex/AGENTS.md` (or `CODEX_HOME`) loads for every
   repository. This is where the universal methodology lives.
2. **Project root → current directory** — each `AGENTS.md` on the path is
   concatenated; the file closest to the working directory appears last and wins
   on conflict. Cap ~32 KiB (`project_doc_max_bytes`).

So a repository `AGENTS.md` is discovered automatically by working in the repo —
it never needs to be exposed globally — and it composes on top of the global core.

## What that means for this skill

- **Methodology stays in the global core**, installed once to `~/.codex/AGENTS.md`.
  The production loop, proof budget, review, and lifecycle are owned there and by
  the installed global skills. Do not copy them into a repository `AGENTS.md`.
- **A repository `AGENTS.md` carries only what the agent cannot derive from the
  code**: what the repo is, layout, commands, hard constraints, and genuinely
  local review expectations — plus the managed agent-workflow block this skill
  appends.
- Everything in the file pays a token cost every turn, in every session, whether
  or not the task needs it. A long file both costs tokens and dilutes itself — the
  more instructions in context, the less reliably the model follows any one.

## Bootstrap and tracker init

When a new **Beads** tracker is selected, its initialization must precede
`apply`. Treat it as a separate commit-capable mutation:

```bash
bd init --skip-agents --skip-hooks --non-interactive
```

Before running it, require a clean worktree and index and explicit authority for
`.beads/`, the root `.gitignore`, the exact repository-local Git config key
`beads.role`, and a local initialization commit. Run `bd --version` first and
require the audited `bd version 1.0.4` boundary; stop before mutation for every
other version. Record the current `HEAD` (or unborn-branch state), status, full
repository-local Git config, the hook path resolved by
`git rev-parse --path-format=absolute --git-path hooks`, and fingerprints of
existing `AGENTS.md`, `CLAUDE.md`, and `.claude/`.

Afterwards, read back every recorded surface and the complete commit path set.
The only permitted local-config delta is `beads.role=maintainer`; existing
instruction files, `.claude/`, and resolved Git hooks remain byte-identical,
previously absent instruction surfaces remain absent, and `.beads/hooks/`
remains absent. Stop if anything else changed. At the audited boundary the
command creates a Git commit even with both skip flags. Do not hide a shared
durable tracker with `--stealth`, and do not initialize it when local commit
authority is absent.

Only after that isolated transition should `apply` seed a **thin** `AGENTS.md`
(specifics only, with fillable placeholders) and symlink `CLAUDE.md` to it when
neither instruction owner exists. This ordering prevents the tracker from
claiming the repository brief or committing the skill's managed files. Beads
usage remains available on demand through `bd --help` and `bd prime`, never as
an injected always-loaded reference.
