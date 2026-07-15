# Capability Catalog

The catalog keeps Codex's global capability surface intentional. It inventories
skills and cached plugins, aggregates privacy-preserving usage evidence, and
reconciles named profiles into `config.toml` without rewriting unrelated
configuration.

## Trust model

- `inventory` and `usage` are read-only.
- `plan` shows a grouped reconciliation without writing; `plan --json` includes
  every exact target.
- only `apply` writes, using a same-directory `0600` backup, a temporary file,
  an original-content hash guard, and atomic rename;
- `check` returns non-zero when a profile has drifted;
- quarantined families can never be enabled and their paths are rejected
  lexically before any file operation;
- inventory and usage reject configured roots with a symlink in any path
  component before traversal;
- app and connector requests are report-only because their account connection
  state is not owned by local Codex TOML;
- no-evidence is a review signal, never automatic proof that a skill is unused.

The permanent quarantine includes `superpowers`. The catalog may report its
logical name as policy evidence, but it never stats, resolves, traverses, or
reads its files.

## Profiles

| Profile | Default use |
|---|---|
| `minimal` | KRN engineering only, with optional surfaces off |
| `lean` | daily KRN engineering with GitHub and official OpenAI docs |
| `design` | lean engineering plus Figma, Canva, and GSAP |
| `web-qa` | lean engineering plus browser automation |
| `comms` | lean engineering plus mail, calendar, and task coordination |
| `full` | every known non-quarantined capability |

Profiles are complete policy documents rather than inheritance chains. A
reader can see every intended state without mentally expanding a parent.

## Commands

After `scripts/install.sh install`, run the manifest-owned executable from any
working directory:

```bash
rtk krn-codex-catalog inventory
rtk krn-codex-catalog usage --days 30
rtk krn-codex-catalog profile show lean
rtk krn-codex-catalog plan lean
rtk krn-codex-catalog apply lean
rtk krn-codex-catalog check lean
```

Inside the source checkout, `rtk npm run catalog -- <command>` is equivalent.

`apply` is the only mutating command. Restart Codex after it succeeds: current
sessions retain the capability index loaded at session start.

## Evidence classes

The scanner streams rollout JSONL and emits aggregates only. It never returns
prompt text, tool arguments, working directories, session IDs, or transcript
fragments.

Records are capped at 16 MiB so a malformed or enormous JSONL line cannot grow
memory without bound. The report exposes malformed, oversized-candidate, and
undated-candidate counts; any non-zero count makes the evidence explicitly
incomplete rather than silently treating the dropped record as no activity.

| Evidence | Confidence | Meaning |
|---|---|---|
| matched tool call and output | high | a tool actually completed in the window |
| exact canonical `SKILL.md` read | medium | the skill body was observed being loaded |
| syntactically recognized nested execution | lower | a conservative static recognizer found the same action |

Codex does not currently persist a dedicated `skill_invoked` event. Implicit
skill use can therefore be undercounted. Every report carries that limitation,
and profile changes remain explicit.

## Reconciliation boundary

The writer owns only `enabled` state for exact plugin, MCP server, and skill
records. It preserves unrelated bytes and recognized MCP transport fields. If
the surrounding TOML is ambiguous or a managed block contains syntax it cannot
preserve safely, it stops instead of guessing.

Plugin cache entries are candidates, not proof of the active version. When a
plugin family is managed off, the catalog therefore keeps explicit `false`
tombstones for every discovered version and forces unknown overrides under the
disabled parent off. An enabled plugin may clear tombstones only for its exact
ID and the curated cache IDs declared in `pluginSkillAliases`; every other
discovered or config-only sibling in that family is forced off. Unknown
tombstones remain harmlessly disabled until an authoritative cleanup source can
prove that their paths are inactive.
