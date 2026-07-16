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
| ad hoc `review-artifacts/` beside active repositories | initiating task or research owner | do not move a live pass; after its owner closes, archive the minimal retained set or delete it explicitly; create every new pass through `prepare-artifacts.mjs` |
| KRN product language, `krn-memory-core`, and Beads | `mise` | retain as domain guidance only |
| global Claude instructions | this repository | install `CLAUDE.md` as a symlink resolving to the same managed `AGENTS.md` core |
| hand-maintained user `PreToolUse` hook | this repository | archive the reviewed legacy RTK hook and install one versioned RTK plus destructive-command guard |

## Installation Invariants

1. Every manifest name is unique.
2. Every installed KRN symlink resolves into this checkout.
3. A real or foreign destination at `~/.agents/skills/<name>` stops the
   installer; it is never overwritten.
4. Legacy paths are resolved inside the selected `CODEX_HOME` and archived only
   when both the manifest allowlist and `KRN_ARCHIVE_LEGACY=1` authorize it.
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

## Rollback

Remove only symlinks that resolve into this checkout, restore the timestamped
backup paths, and restart Codex. Archived objects retain their metadata because
the installer moves rather than copies them. Restore only into an absent path
or over the still-managed symlink; never overwrite a new foreign occupant.
