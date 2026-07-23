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

When no `AGENTS.md` or `CLAUDE.md` exists, `apply` seeds a **thin** `AGENTS.md`
(specifics only, with fillable placeholders) and symlinks `CLAUDE.md` to it — the
skill owns the repository brief, so a tracker's own init never fills the void.

If the tracker is **beads**, initialize it without injecting bd's always-loaded
reference into the repository brief:

```bash
bd init --agents-profile minimal --non-interactive
```

`--agents-profile minimal` leaves only a one-line pointer ("this repo uses beads;
`bd prime`"), not bd's full command reference and session-completion rules. The
durable queue and claim state live in `.beads/`; bd's usage is available on demand
via `bd --help` and `bd prime`, never as an always-loaded brief.
