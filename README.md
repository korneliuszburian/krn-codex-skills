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
design question -> prototype        -> validated decision -> implement
full outcome  -> delivery-loop      -> owned stages  -> truthful lifecycle state
unknown fault -> diagnosing-bugs    -> cause-level fix or bounded diagnosis
source claim  -> source-to-decision -> decision      -> implement
settled thread -> to-spec           -> published spec -> slice-work
settled spec  -> slice-work          -> vertical slices -> implement
foggy effort  -> wayfinder          -> decision map   -> to-spec/slice-work/implement
another repo  -> target-repo-work   -> scoped result -> handoff
repo setup    -> setup-repository-workflow -> thin local contract -> normal owner
TypeScript    -> workflow owner + typescript-engineering companion
global tools  -> managing-codex-capabilities -> reviewed profile -> fresh session
foggy choices -> batch-grill-me     -> confirmed decision ledger -> chosen owner
```

Visual routing of these paths: [`docs/work-pipeline.md`](docs/work-pipeline.md).

`config/AGENTS.md` carries one universal production-first core. Codex loads it
directly; Claude's `CLAUDE.md` resolves to the same file. The repository `AGENTS.md`
adds only this source repo's contract. Skill descriptions route work. A
selected `SKILL.md` carries the repeated process. References load only for the
branch that needs them.

## Skills

| Skill | Invocation | Owns |
|---|---|---|
| [`implement`](docs/engineering/implement.md) | model or user | one scoped production slice and proportional proof |
| [`prototype`](docs/engineering/prototype.md) | model or user | a throwaway prototype answering one design question, captured as a primary source |
| [`diagnosing-bugs`](docs/engineering/diagnosing-bugs.md) | model or user | unknown failures, flakes, regressions, and slowness |
| [`delivery-loop`](docs/engineering/delivery-loop.md) | model or user | one outcome carried through claim, proof, review, and authorized publication state |
| [`code-review`](docs/engineering/code-review.md) | model or user | read-only Standards and Spec review |
| [`codebase-design`](docs/engineering/codebase-design.md) | model or user | deep modules, public seams, and interface shape |
| [`domain-modeling`](docs/engineering/domain-modeling.md) | model or user | active terminology and rare durable decisions |
| [`source-to-decision`](docs/engineering/source-to-decision.md) | model or user | external evidence turned into an owned decision |
| [`to-spec`](docs/engineering/to-spec.md) | model or user | a settled conversation compressed into one destination-first published spec |
| [`slice-work`](docs/engineering/slice-work.md) | explicit only | a settled spec decomposed into implementation-ready vertical slices |
| [`wayfinder`](docs/engineering/wayfinder.md) | explicit only | a foggy multi-session effort charted as decision tickets until the route clears |
| [`target-repo-work`](docs/engineering/target-repo-work.md) | model or user | authority and state when operating on another repo |
| [`setup-repository-workflow`](docs/engineering/setup-repository-workflow.md) | explicit only | one-time adoption or repair of a thin repo-local agent contract |
| [`typescript-engineering`](docs/engineering/typescript-engineering.md) | model or user | TypeScript boundaries, APIs, compiler mechanics, and proof |
| [`managing-codex-capabilities`](docs/meta/managing-codex-capabilities.md) | model or user | global skill, plugin, MCP, usage, and profile control |
| [`writing-great-skills`](docs/meta/writing-great-skills.md) | model or user | predictable skill authoring and trigger design |
| [`second-opinion-review`](docs/advisory/second-opinion-review.md) | explicit only | validated Claude research campaigns, isolated rewrite handoffs, or fixed-point checker |
| [`batch-grill-me`](docs/productivity/batch-grill-me.md) | explicit only | frontier-round interview before any artifact or implementation |

No top-level “coding system” orchestrates everything. Native Codex goal mode
owns long-running outcome state; repositories choose their durable tracker;
the focused skills compose through their boundaries.

## Install

This source repository owns the versioned skills. The installed skill index
contains symlinks into it, so a pull updates installed KRN skills without
copying or forking them again.

```bash
npm run validate
bash scripts/install.sh check
bash scripts/install.sh install
```

On the one-time migration, inspect every reported legacy or global path, then
authorize only the replacement classes you actually reviewed:

```bash
env KRN_ARCHIVE_LEGACY=1 KRN_REPLACE_GLOBAL_AGENTS=1 \
  KRN_REPLACE_GLOBAL_CLAUDE=1 KRN_REPLACE_GLOBAL_HOOKS=1 \
  bash scripts/install.sh install
```

The installer:

- links only manifest-owned skills into `~/.agents/skills`;
- links the manifest-owned `krn-codex-catalog` executable into
  `~/.local/bin`;
- leaves vendor and unrelated skills untouched;
- archives named legacy paths only with explicit migration authority;
- installs the versioned global `AGENTS.md`;
- installs a collision-safe Claude `CLAUDE.md` symlink to that same semantic
  core;
- installs one versioned user-level `PreToolUse` hook that denies the forbidden
  capability family and blocks destructive removal of repository roots, agent
  configuration, secrets, Beads state, and database files;
- refuses unowned skill/global-instruction collisions and masking
  `AGENTS.override.md` files, and refuses foreign hook replacement without
  `KRN_REPLACE_GLOBAL_HOOKS=1`.

`CODEX_HOME` selects Codex legacy paths, backups, and its global instruction
target, hook configuration, and hook scripts. `CLAUDE_CONFIG_DIR` selects Claude's instruction targets.
`KRN_SKILLS_DEST` independently selects the user skill index, and
`KRN_BIN_DEST` selects the executable directory. Set all four for an isolated
temp-root trial. Overriding one never silently redirects another.

Run `check` again after installation. Restart Codex if the current session
does not refresh its installed skill index: discovery is session-scoped, so an
already-open picker is not evidence that the installed symlink is missing.
`setup-repository-workflow`, `second-opinion-review`, and `batch-grill-me` are
explicit-only: Codex cannot select them implicitly, while an explicit `$skill`
invocation remains available. Some API sessions may omit them from the injected
model-visible list; that observation is not the activation contract. In a fresh
interactive session, type the full `$skill-name` and select its **[Skill]**
entry from the picker; plain prompt text that resembles the name is not the same
attachment.

New or changed non-managed hooks must also be reviewed and trusted through
`/hooks`; Codex binds trust to the exact hook definition.

`$second-opinion-review` resolves configured repository work under
`docs/agents/runs/second-opinion-review/<run-id>` and falls
back to `~/coding/krn/second-opinion-review/<project>/<category>/<pass>` for
unconfigured or ad-hoc work,
where `project` is the cwd git repository and `category` is the role
(`research`, `rewrite`, or `check`). Run `prepare-artifacts.mjs list` to
enumerate passes with their project, category, and job state. Do not place ad
hoc review folders beside active repositories; the skill defines what is
retained and when the initiating issue or goal can archive or remove it.

Large research uses a versioned `campaign.json`: independent read-only shards
publish validated mechanism ledgers, then one synthesis shard consumes only
those current results. Every shard has a bounded Claude budget and timeout,
durable job state, exact source coverage, and a freshness check across the
campaign, clean repository, mechanically pinned local artifacts, declared URL
provenance, and dependency results.
This is source investigation, not a second code-review lane; all recommendations
remain advisory until the local owner verifies and disposes them.

## Capability Catalog

Global integrations are managed through named, reviewable profiles instead of
accumulating version-pinned skill overrides by hand:

```bash
krn-codex-catalog inventory
krn-codex-catalog usage --days 30
krn-codex-catalog plan lean
krn-codex-catalog apply lean
```

`lean` keeps the daily engineering surface small; `design`, `web-qa`, and
`comms` opt specialized integrations back in. Usage reports aggregate only
structured evidence and never disable anything automatically. See
[`docs/CAPABILITY_CATALOG.md`](docs/CAPABILITY_CATALOG.md) for profiles,
evidence limits, quarantine, and atomic-write guarantees.

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
