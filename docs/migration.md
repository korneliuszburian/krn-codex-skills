# Installation and migration

`krn-codex` installs a verified, immutable runtime snapshot. The source
checkout remains an authoring surface; it is never a stable discovery target.

Status: `accepted`. Consumer: KRN operators applying, checking, or rolling back
the installed runtime. Owner: the installer and release-maintenance workflow.
Verified: 2026-09-13.

## Ownership

| Surface | Owner | Installer action |
|---|---|---|
| manifest-declared skills, bins, global AGENTS, hooks | this repository | copy their runtime closure into a commit-addressed release and link stable destinations through `current` |
| vendor, plugin-cache, and upstream skills | their own owner | leave untouched |
| foreign stable destination | operator | refuse without changing it |
| old KRN link into the selected source checkout or a prior KRN release | KRN installer | move the link to a timestamped backup, then replace it through `current` |

## Installation invariants

1. Every manifest name is unique and source validation passes before staging.
2. A release lives at `$CODEX_HOME/krn/releases/<commit>/`, is addressed by
   the exact clean Git `HEAD`, and contains only the manifest-owned runtime
   closure and its direct runtime dependencies.
3. Release metadata binds the commit, sorted runtime paths, and a content
   digest. Existing matching releases are idempotent; a mismatch is corruption.
4. `$CODEX_HOME/krn/current` is atomically switched only after the complete
   staged release has been read and hashed.
5. Stable entries in `~/.agents/skills`, `~/.local/bin`, `$CODEX_HOME/AGENTS.md`,
   `$CODEX_HOME/hooks.json`, `$CODEX_HOME/hooks/`, `~/.config/opencode/AGENTS.md`,
   and `~/.config/opencode/plugins/` point through `current`.
   They never point directly to an active checkout. The opencode entries carry
   the interactive adapter (guard, capsule brief, adoption signal); lanes and
   labs remain Codex-only.
6. A foreign file, directory, or link fails closed. The installer can replace
   only a prior link into the selected source checkout or a release, preserving it under
   `$CODEX_HOME/krn/migration-backups/`.
7. Legacy names outside manifest ownership, vendor skills, and plugin caches
   are not inferred or cleaned up by installation.
8. If reconciliation fails after switching `current`, the previous `current`
   binding is restored. The unselected staged release remains diagnostic state.
9. The runtime closure is declared by the artifact being installed
   (`skills/manifest.json` `runtime_paths`), never by the running installer
   version. After switching `current`, `apply` smoke-runs the linked CLI and
   restores the previous `current` if it cannot start, so a release that omits
   a runtime module fails closed instead of reporting a broken install.

Codex runs the managed guard from `$CODEX_HOME/hooks.json`, which is a
non-managed user hook: Codex marks a new or changed hook for review and skips
it until the operator trusts the definition in `/hooks`. A fresh
`install apply`, a prune, or a rollback therefore leaves the guard inert until
that review; `install apply` and `doctor` do not record hook-trust state, so the
contract's interception guarantee holds only after the hook is trusted.

## Doctor evidence

`krn-codex doctor --json` is a filesystem observer, not a discovery or
execution test. Its filesystem state is one of `filesystem_installed`,
`stable_link_bypasses_current`, `legacy_mutable_source`, `orphaned_link`,
`foreign_collision`, `legacy_hook_conflict`, `broken_link`, `missing`, or
`masked_by_override`. A stable link into a legacy mutable source checkout is
reported as `legacy_mutable_source` (a same-relative link into a checkout that
carries `scripts/krn-codex.mjs`); `install apply` migrates it. The last state
means a
present `$CODEX_HOME/AGENTS.override.md` would block `install apply`, even if
the installed release and stable links themselves are intact.
It reports session loading as `session_loaded_unknown` and post-install loading
as `stale_session_likely` until a fresh Codex session provides stronger evidence.

`doctor` also reports `hookPolicy` read from the managed requirements file
(`/etc/codex/requirements.toml` on Unix, `%ProgramData%\OpenAI\Codex\requirements.toml`
on Windows; override with `KRN_REQUIREMENTS_PATH`). A top-level
`allow_managed_hooks_only = true` yields `hook_inert_by_managed_policy` and a
managed `[features] hooks = false` yields `hook_inert_features_disabled`: both
make the non-managed `$CODEX_HOME/hooks.json` guard inert even after the operator
trusts it, so `install check` exits 3. Otherwise the status is `hooks_active`,
or `no_managed_requirements` / `requirements_unreadable` when the file is absent
or cannot be parsed. Cloud-managed and macOS MDM requirements are not readable
from the filesystem and remain outside this observer.

## Rollback

Select a verified prior release by atomically repointing `current`, restore a
timestamped KRN-link backup only into an absent path or over its still-managed
replacement, then restart Codex. Never overwrite a new foreign occupant. Do
not delete a release while an installed link or session may still depend on it.
`krn-codex install prune --keep N` automates retention: it keeps the current
release and the N most recent, and never removes a release that a managed link
still resolves into. Concurrent applies are not serialized: each apply repoints
`current` atomically, but a rollback that loses a race can repoint `current` to
its own prior target, so run one apply or rollback at a time.

If `install apply` exits 66 (`existing release is corrupt`) or `doctor` reports
`broken_link`, `current` selects an unverified release; a dangling or foreign
`current` exits 73 (`refusing foreign current binding`). Re-running apply does
not rebuild a corrupt release (it fails closed again) and cannot repair a
foreign `current`; recover by repointing `current` to a verified sibling
release through an atomic relative-symlink rename, or, when no sibling is
verified, delete the corrupt release directory **and** the `current` symlink
and every managed link, then re-run apply from the clean checkout at that
commit (a dangling `current` or a stale managed link makes apply fail closed
at exit 73). Never edit a release in place;
delete a corrupt or superseded release only after no installed link or session
references it.

The release digest ledger is committed at `config/release-digests.json`; `krn install check` reports `digest-unsealed` when a release tree has no entry, and the `.krn-release.json` file remains the per-release metadata. An independent review on 2026-09-16 showed the default check still anchors on the ledger copy inside the release, so the committed anchor is armed by sh-54. Historical note: the paragraph previously said inside the release tree and
excludes itself, so it detects content corruption but not a writer who rewrites
both the tree and that metadata; a separate trust anchor is out of scope for a
single-user cooperative install.
