# Migration

## Ownership

| Current surface | Target owner | Action |
|---|---|---|
| `~/.codex/skills/{code-review,codebase-design,diagnosing-bugs,writing-great-skills}` | this repository | archive legacy copies, install canonical symlinks |
| broken `claude-second-opinion-review` symlink | `second-opinion-review` | archive the broken alias, install one explicit skill |
| third-party browser, GSAP, Omarchy, system, and plugin skills | upstream/vendor | preserve untouched |
| old public `krn-codex-skills` layout | this branch | replace project-local pack with global source |
| private `krn-skills` | WordPress/domain owner | keep domain-only; do not install as global engineering canon |
| `mini-metalab-skills` and `krn-skills-lab` | evaluation owners | keep as labs, never runtime sources |
| generic review, diagnosis, implementation, TypeScript, and advisory workflow formerly in `mise` | this repository | removed from `mise` main; discover only from the installed global catalog |
| retired installed `reviewer-handoff` entry | no replacement workflow; `code-review` reviews and `second-opinion-review` owns its checker transport | report during `check`; archive only with `KRN_ARCHIVE_LEGACY=1` |
| old `reviews/`, `review-artifacts/`, or configured working-run roots | initiating goal or review owner | close each live pass, then remove it explicitly; create every new pass below `.krn/runs/second-opinion-review/` |
| generated `docs/agents/{domain,delivery,artifacts,review,artifact-paths}.md` adapters in product repositories | closest repository contract and semantic owner | remove only after confirming the setup ownership marker and that no live consumer remains; the new setup does not recreate them |
| KRN product language, `krn-memory-core`, and Beads | `mise` | retain as domain guidance only |
| global Claude instructions | this repository | install `CLAUDE.md` as a symlink resolving to the same managed `AGENTS.md` core |
| hand-maintained user `PreToolUse` hook | this repository | archive the reviewed legacy hook and install one versioned destructive-command guard; the earlier token-proxy rewrite is retired |

## Installation Invariants

1. Every manifest name is unique.
2. Every installed KRN symlink resolves into this checkout.
3. A real or foreign destination at `~/.agents/skills/<name>` stops the
   installer; it is never overwritten.
4. Legacy paths and retired skill-index entries are manifest-declared and
   archived only when `KRN_ARCHIVE_LEGACY=1` authorizes them.
5. Displaced state is recoverable from the timestamped migration backup.
6. Vendor skills and plugin caches are outside the migration surface.
7. A foreign global `AGENTS.md` requires `KRN_REPLACE_GLOBAL_AGENTS=1`;
   `AGENTS.override.md` always stops installation because it masks the managed
   file.
8. `CODEX_HOME` scopes Codex config and migration backups;
   `KRN_SKILLS_DEST` independently scopes the installed user skill index.
9. `CLAUDE_CONFIG_DIR` scopes Claude instructions. A foreign `CLAUDE.md`
   requires `KRN_REPLACE_GLOBAL_CLAUDE=1` and is archived before replacement.
10. User-level `hooks.json`, manifest-owned hook files, and named legacy hook
    paths stay inside `CODEX_HOME`. A foreign target requires
    `KRN_REPLACE_GLOBAL_HOOKS=1` and is archived before replacement.
11. A removed promoted skill remains in `retired_skills` until supported installs
    no longer expose its old index entry. Retirement never silently deletes a
    foreign occupant.

## Rollback

Remove only symlinks that resolve into this checkout, restore the timestamped
backup paths, and restart Codex. Archived objects retain their metadata because
the installer moves rather than copies them. Restore only into an absent path
or over the still-managed symlink; never overwrite a new foreign occupant.
