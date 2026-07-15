# KRN Skills

Production-first engineering skills for Codex.

The system is intentionally small: one workflow owner, one name, one global
installation, and domain knowledge left with the product that owns it.

The manifest enforces name and installation uniqueness. Workflow ownership is
semantic: trigger cases, fresh-session smokes, and review must show that two
skills do not claim the same repeated sequence. Discovery never implies
ownership.

## The Shape

```text
clear change  -> implement          -> focused proof -> code-review
unknown fault -> diagnosing-bugs    -> cause-level fix or bounded diagnosis
source claim  -> source-to-decision -> decision      -> implement
another repo  -> target-repo-work   -> scoped result -> handoff
TypeScript    -> workflow owner + typescript-engineering companion
```

`config/AGENTS.md` carries one universal production-first core. Codex loads it
directly; Claude's `CLAUDE.md` resolves to the same file. The repository `AGENTS.md`
adds only this source repo's contract. Skill descriptions route work. A
selected `SKILL.md` carries the repeated process. References load only for the
branch that needs them.

## Skills

| Skill | Invocation | Owns |
|---|---|---|
| `implement` | model or user | one scoped production slice and proportional proof |
| `diagnosing-bugs` | model or user | unknown failures, flakes, regressions, and slowness |
| `code-review` | model or user | read-only Standards and Spec review |
| `codebase-design` | model or user | deep modules, public seams, and interface shape |
| `domain-modeling` | model or user | active terminology and rare durable decisions |
| `source-to-decision` | model or user | external evidence turned into an owned decision |
| `target-repo-work` | model or user | authority and state when operating on another repo |
| `typescript-engineering` | model or user | TypeScript boundaries, APIs, compiler mechanics, and proof |
| `writing-great-skills` | model or user | predictable skill authoring and trigger design |
| `second-opinion-review` | explicit only | isolated Claude research/rewrite handoff or validated checker |

No top-level “coding system” orchestrates everything. Native Codex goal mode
owns long-running outcome state; repositories choose their durable tracker;
the focused skills compose through their boundaries.

## Install

This source repository owns the versioned skills. The installed skill index
contains symlinks into it, so a pull updates installed KRN skills without
copying or forking them again.

```bash
rtk npm run validate
rtk bash scripts/install.sh check
rtk bash scripts/install.sh install
```

On the one-time migration, inspect every reported legacy or global path, then
authorize only the replacement classes you actually reviewed:

```bash
rtk env KRN_ARCHIVE_LEGACY=1 KRN_REPLACE_GLOBAL_AGENTS=1 \
  KRN_REPLACE_GLOBAL_CLAUDE=1 \
  bash scripts/install.sh install
```

The installer:

- links only manifest-owned skills into `~/.agents/skills`;
- leaves vendor and unrelated skills untouched;
- archives named legacy paths only with explicit migration authority;
- installs the versioned global `AGENTS.md`;
- installs a collision-safe Claude `CLAUDE.md` symlink to that same semantic
  core;
- refuses unowned skill/global-instruction collisions and masking
  `AGENTS.override.md` files.

`CODEX_HOME` selects Codex legacy paths, backups, and its global instruction
target. `CLAUDE_CONFIG_DIR` selects Claude's instruction targets.
`KRN_SKILLS_DEST` independently selects the user skill index. Set all three for
an isolated temp-root trial. Overriding one never silently redirects another.

Run `check` again after installation. Restart Codex if the current session
does not refresh its installed skill index.

## Proof Budget

| Budget | Use |
|---|---|
| `0` | type-only, mechanical, documentation, topology, or already-covered refactor |
| `1` | one changed runtime contract, parser, validator, bug, migration, or authority rule |
| `N` | distinct acceptance requirements with distinct failure modes |

Tests are retained only when they can disagree with production code through a
stable public seam. Broad suites are completion evidence, not the inner loop.

## Repository Map

```text
AGENTS.md    source-repository editing contract and map
config/       installed global guidance
skills/       promoted skills grouped by responsibility
evals/        positive and negative trigger cases
scripts/      installer and deterministic validation
docs/         provenance and migration ownership
CONTEXT.md    the shared vocabulary
```

See `docs/SOURCES.md` for provenance and `docs/typescript-coverage.md` for the
chapter-to-mechanism decision ledger distilled from *Total TypeScript*. The
source material itself is not vendored.
