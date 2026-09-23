# Capability Catalog

The catalog keeps Codex's global capability surface intentional. It inventories
skills and cached plugins, aggregates privacy-preserving usage evidence, and
reconciles named profiles into `config.toml` without rewriting unrelated
configuration.

Status: `accepted`. Consumer: operators selecting or auditing a KRN capability
profile. Owner: `managing-codex-capabilities`. Verified: 2026-09-23.

## Trust model

- `inventory` and `usage` are read-only.
- `plan` shows a grouped reconciliation without writing; `plan --json` includes
  every exact target.
- only `apply` writes, using a same-directory `0600` backup, a temporary file,
  an original-content hash guard, and atomic rename;
- `check` returns non-zero when a profile has drifted;
- quarantined families can never be enabled and their paths are rejected
  lexically before any file operation;
- third-party and vendor skill/MCP descriptors and bodies are an untrusted
  instruction channel: re-review their content on update instead of trusting
  the enablement tombstone (arXiv:2605.11418, 2602.20156);
- inventory and usage reject configured roots with a symlink in any path
  component before traversal;
- app and connector requests are report-only because their account connection
  state is not owned by local Codex TOML;
- no-evidence is a review signal, never automatic proof that a skill is unused.

The permanent quarantine includes `superpowers`. The catalog may report its
logical name as policy evidence, and it never records, reads, or returns a
quarantined family's files as a capability: a configured root, directory entry,
symlink target, or resolved target that lands in a quarantined family is refused
with quarantine evidence.

## Skill roots

The inventory reads `$CODEX_HOME/skills` (`user`), `$CODEX_HOME/skills/.system`
(`system`), `$AGENTS_HOME/skills` (`global-index`), and
`~/.config/opencode/skills` (`vendor-global`, the OpenCode host that loads it).
A symlinked skill counts only when its resolved `SKILL.md` exists, so a dangling
symlink is not reported as a capability; the chain is walked hop-by-hop, each
hop is screened against the hard quarantine before the next `stat`, and the
resolved target is refused if it lands in a quarantined family. Resolving a
symlinked path can `stat` intermediate components, but quarantined content is
never read or recorded. A resolved target that is not named `SKILL.md` (or lives
under a forbidden path family such as `logs`) is still inventoried, but it is
not a usage-canonical path, so reads of that target are not attributed. The same skill name found in two roots
is listed once per scope and is not deduplicated, because scope drives profile
reconciliation; this double-counts a name that two roots share. The always-loaded
contract (`config/AGENTS.md`) is bounded by an information budget, not only a
line count: `validate` caps it at 60 lines, 620 words, 320 characters per
line, and 5200 characters in total (an information budget), so the always-loaded
file cannot regrow through unwrapped prose.

## Profiles

| Profile | Default use |
|---|---|
| `minimal` | KRN engineering plus the Wakatime baseline, with other optional surfaces off |
| `lean` | daily KRN engineering with GitHub and official OpenAI docs |
| `design` | lean engineering plus Figma, Canva, and GSAP |
| `web-qa` | lean engineering plus browser automation, documentation lookup, and Figma MCP |
| `comms` | lean engineering plus mail, calendar, and task coordination |
| `full` | broadest managed integration surface; duplicate and displaced workflow owners stay off |

Profiles are complete policy documents rather than inheritance chains. A
reader can see every intended state without mentally expanding a parent.

Retained explicit-only skills can still be disabled by a profile. The user
explicitly restored `ask-gpt` availability on 2026-09-22: `lean` and `minimal`
now admit the installed owner from `skills/manifest.json`. It remains
explicit-only; enabling it does not start a model or a research run. The earlier
exclusion was a profile choice, not retirement or evidence of disuse. Manual
availability and automatic workflow invocation are separate decisions.

Workflow admission is derived from `skills/manifest.json` and the pinned
`harness_paths` plus explicit availability companions in
`config/upstream-sources.json`. Companions make an upstream procedure available;
they do not force its invocation. Profiles own optional extensions and explicit
exclusions. Unknown global skills, plugins, and MCP servers default disabled,
including plugin/MCP records found only in configuration. Project and system
scopes are preserved before ordinary name selectors. Missing derived owners
make `check` report an incomplete installation rather than convergence.

## Equivalent exports and host scope

`plan`, `apply`, and `check` reconcile the current repository, or the explicit
`--root`, against installed owners. Only a generated KRN export with a matching
marker, complete directory digest, authorized global source, and enabled global
owner can defer to that installed owner. The writer marks its exact project-path
overrides in Codex TOML; there is no additional registry. A changed reference,
missing owner, or lost equivalence makes `check` drift and `apply` withdraws its
own override. Independent user overrides and authored project skills remain
untouched. Run reconciliation after changing an export, checkout, release, or
profile: Codex path overrides are not conditional on a content digest.

These are user-layer rules rather than project TOML settings: Codex 0.155.1
reads skill enablement from user and session layers. Fresh CLI discovery has
bounded local evidence; a current desktop session still needs its own readback.

OpenCode has its own discovery and permission model. The sh-166 candidate extends
the existing KRN adapter to project the profile at instance configuration, using
`KRN_CAPABILITY_PROFILE` or `lean`. It disables unadmitted global skill names,
preserves names owned by the current project, and leaves native system defaults
with OpenCode. It does not infer OpenCode state from Codex TOML. These are name
permissions for visibility and invocation, not a filesystem sandbox: OpenCode
may parse a discovered skill before filtering it. Global agent prompts, goal
plugins, and account connections retain their separate owners.

The admission and composition rules above describe the source candidate. Its
full frozen observer, six reviewed edge cases and full gates remain open;
the OpenCode extension is not installed. Local Codex convergence does not imply
complete cross-host implementation or a sealed release. The outcome capsule
and configured sh-166 ticket own current execution evidence and remaining work.

Read-only check on 2026-09-23: the global OpenCode plugin symlink resolved to
the installed `7acc1d4` release and its bytes matched that baseline, while the
new capability projection exists only in the dirty sh-166 source. The available
`opencode --version` returned `1.18.30`. These observations establish selected
installed bytes and a CLI version; they do not show which plugin/config a
running application process loaded. The five sh-166 cases remain the known
source defects, with no additional behavioral defect established by the report
campaign. A later local review found that KRN origin admission still trusted a
matching path suffix; a focused counterexample failed before the current source
repair and passed after checking the real installed owner under `krn/current`.
After authorized repair and installation, a fresh process must read
back effective permissions for admitted global, denied global and preserved
project skills. A source or symlink check is insufficient for that claim.

Falsifier: an unknown global option stays enabled, a preserved project skill is
disabled by a global name collision, an unavailable owner hides its project
fallback, or a changed export keeps a producer-owned exclusion after apply.
Supersede these host rules when discovery or permission semantics change.

## Capability state vocabulary

Catalog output uses four evidence-bounded states. They are separate dimensions,
not a progression that the local catalog can always observe end to end.

| State | Meaning |
|---|---|
| `declared` | intent required by the selected profile |
| `discovered_candidate` | an entry found in inventory, configuration, or cache; not installation, loading, or usability proof |
| `configured_enabled` | the local `enabled` value owned by catalog reconciliation; the value may be on or off |
| `observed_used` | positive evidence in the reported window, with confidence and completeness metadata |

Usage output represents absence as `no_evidence`, never as proof that a
capability is unused. It reports `evidence_confidence` as `high`, `medium`, or
`lower`, the evidence window, and whether dropped candidate records make the
scan incomplete. The underlying evidence classes remain the authority for what
those confidence levels mean.

Two states remain outside local catalog authority:

```text
loaded_in_current_session: unknown
account_connected_and_authorized: report-only
```

A fresh-session check can supply session evidence; the relevant account owner
supplies connection and scope evidence. Neither is inferred from profile intent,
cache discovery, local TOML, or a positive usage record.

## Commands

After `krn install apply --source <clean-checkout> --yes`, run the
manifest-owned CLI from any working directory:

```bash
krn capability inventory
krn capability usage --days 30
krn capability profile show lean
krn capability plan lean
krn capability apply lean
krn capability check lean
```

`krn-codex-catalog` is still declared as a compatibility entrypoint, but the
sealed release `9f18ab2442ab0f920e2aa8753228e12dc0c7c549` exits with
`MODULE_NOT_FOUND`: its wrapper calls the retired, unshipped
`scripts/krn-codex.mjs`. The current source WIP points the wrapper at shipped
`krn.mjs` and passes an isolated installed-bin smoke; the live installed alias
remains broken until a new release is authorized and installed. Use
`krn capability` for installed operations now. The source-checkout
`npm run catalog -- COMMAND` alone does not prove the installed alias works.
`scripts/catalog.mjs` is the
capability implementation behind the public `krn capability` command;
`scripts/krn-codex.mjs` remains in the checkout only for frozen conformance.

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
