# KRN Skills

[![validate](https://github.com/korneliuszburian/krn-codex-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/korneliuszburian/krn-codex-skills/actions/workflows/validate.yml)

**What this is** — KRN's universal Codex workflows: one owner per repeated
process, a small compiled context spine, and deterministic gates that keep
agent work honest across long, multi-session outcomes.

**Who it's for** — KRN engineers and their coding agents in any repository,
plus anyone maintaining the global skill set.

**Start here**

```bash
npm run gate                    # validate this checkout (all gates)
krn doctor                      # inspect the installed release (text)
krn state compile               # compile a restart capsule for an outcome
node scripts/krn.mjs ...        # every command before `krn` is installed
```

Production-first Codex workflows with one owner per repeated process. Global
policy stays small; product language stays with the product; working context is
compiled into a few semantic artifacts instead of accumulated as reports.

## Workflow

```mermaid
flowchart LR
  INPUT["request + current repository truth"] --> GATE{"smallest unresolved uncertainty"}
  GATE -->|explicit tracker-backed orientation| WAY["upstream wayfinder (composed)"]
  GATE -->|one decision| DECIDE["typed decision owner"]
  GATE -->|spec or decomposition missing| SHAPE["upstream to-spec or $slice-work"]
  GATE -->|clear production slice| IMPL["upstream implement (composed)"]
  GATE -->|unknown cause| DIAG["upstream diagnosing-bugs (composed)"]
  GATE -->|fixed review surface| REVIEW["upstream code-review (composed)"]
  GATE -->|outcome satisfied or no authorized next action| TERMINAL["bounded terminal state"]
  WAY --> GATE
  DECIDE --> GATE
  SHAPE --> GATE
  DIAG -->|cause proven + repair + mutation authorized| IMPL
  DIAG -->|otherwise| BOUNDED["bounded diagnosis"]
  IMPL --> PROOF["0 / 1 / N proof"]
  PROOF -->|non-trivial, requested, or envelope active and not mechanical 0-budget| REVIEW
  PROOF -->|otherwise| STATE
  REVIEW -->|accepted finding + repair + mutation authorized| IMPL
  REVIEW -->|unresolved or authority absent| NEEDS["NEEDS_REVIEW"]
  REVIEW -->|both axes green on same fixed point| STATE["initiating owner records truthful outcome + publication state"]
  FULL["agreed end-to-end outcome"] --> LOOP["$delivery-loop<br/>lifecycle envelope"]
  LOOP -. selects one current owner and records transitions .-> GATE
```

The diamond is a routing rule, not a router skill. Settled work skips every
resolved phase: a clear slice enters the composed upstream `implement`, and a
fixed diff, PR, or fingerprinted working tree enters the composed upstream
`code-review`. The typed decision owner is `$source-to-decision` when
external evidence must change a named local decision, and composed upstream
for the rest: `domain-modeling` for a user-owned choice or contested concept,
`grilling` for adversarial sharpening of a plan or decision, `prototype` for a
disposable runnable experiment, or `codebase-design` for a seam or ownership
decision. Each returns a bounded
result to the current owner; none becomes a mandatory pipeline stage. The canonical condition → handler
table, and with it the repository-scoped harness baseline, is owned by
[`delivery-loop/references/transitions.md`](skills/engineering/delivery-loop/references/transitions.md);
this README keeps only the operator graph.

`target-repo-work` wraps another checkout. `typescript-engineering` is a
language companion. `opencode-second-opinion` is an explicit advisory side path.
Setup, capability management, and skill authoring remain separate owners. The
evidence, admission map, and lifecycle invariants live in
[the orchestration synthesis](docs/research/orchestration.md).

## Compact context spine

```mermaid
flowchart TD
  GOAL["accepted request / native Goal<br/>+ tracker when configured"] --> LOOP["$delivery-loop<br/>sole capsule writer"]
  LOOP --> CAPSULE["living outcome capsule"]
  CAPSULE --> OWNER["one current workflow owner"]
  OWNER --> EVIDENCE["repository state + falsifying evidence"]
  EVIDENCE --> LOOP
  CAPSULE --> RUNS["restart path and reader commands<br/>owned by config/AGENTS.md"]
  CAPSULE --> CLEANUP["owned specialist-run<br/>cleanup obligations"]
  CLEANUP -->|consumer finishes or Goal closes| DELETE
  EVIDENCE --> GATE{"consumer + destination +<br/>cleanup / supersession?"}
  GATE -->|shared outcome state, when configured| TRACKER["configured tracker"]
  GATE -->|shared language| CONTEXT["CONTEXT.md"]
  GATE -->|consequential trade-off| ADR["docs/adr/"]
  GATE -->|source-backed decision| RESEARCH["docs/research/"]
  GATE -->|no| DELETE["keep transient, then delete"]
```

The capsule's sole writer, named in `config/AGENTS.md`, rewrites it at owner and
context boundaries. Other workflows return evidence to that writer or continue through
the native Goal/tracker; they do not create another capsule. Git history is the
chronological log; raw transcripts, prompts, and reviewer packets do not become
documentation by default. When no tracker is configured, the accepted request or
native Goal plus capsule, repository, and host readback carry current truth; no
tracker capability is emulated.

When sources disagree, the accepted user request or native Goal supplies intent
and authority, repository and host state supply observed execution truth, and a
configured tracker supplies shared remote acceptance and publication truth. The
capsule is a compiled cache, never the winning source; an irreconcilable
disagreement blocks the next transition until the owner records the resolution.

## Skills

| Skill | Invocation | Owns |
|---|---|---|
| [`source-to-decision`](skills/engineering/source-to-decision/SKILL.md) | model or user | one source-backed disposition for a named local consumer |
| [`slice-work`](skills/engineering/slice-work/SKILL.md) | model or user | vertical implementation slices or expand-contract migration stages |
| [`delivery-loop`](skills/engineering/delivery-loop/SKILL.md) | model or user | lifecycle truth and handoffs for one agreed end-to-end outcome |
| [`target-repo-work`](skills/engineering/target-repo-work/SKILL.md) | model or user | identity and authority when work crosses into another checkout |
| [`setup-repository-workflow`](skills/engineering/setup-repository-workflow/SKILL.md) | explicit only | one-time adoption or repair of a thin local contract |
| [`typescript-engineering`](skills/engineering/typescript-engineering/SKILL.md) | model or user | TypeScript inference, public APIs, compiler mechanics, and proof |
| [`test-audit`](skills/engineering/test-audit/SKILL.md) | explicit only | junk-pattern audit and owner-boundary pruning of a test surface |
| [`opencode-second-opinion`](skills/advisory/opencode-second-opinion/SKILL.md) | explicit only | bounded independent-model opinion on one explicit path, without diffs |
| [`ask-gpt`](skills/advisory/ask-gpt/SKILL.md) | explicit only | shape an evidence-bound GPT-6 Astra prompt over the GitHub connector and disposition the answer locally |
| [`managing-codex-capabilities`](skills/meta/managing-codex-capabilities/SKILL.md) | model or user | global skill, plugin, MCP, and profile control |
| [`unslop`](skills/meta/unslop/SKILL.md) | explicit only | audit or rewrite robotic prose without semantic drift |

The shared engineering and productivity flow is **composed from a clean
checkout of the upstream [`mattpocock/skills`](https://github.com/mattpocock/skills)
set at the commit pinned by `config/upstream-sources.json`, not owned here**.
The lock file is the machine-readable source of the set; `config/AGENTS.md`
contains the stable ownership boundary. Do not use a moving `npx skills add`
result as the KRN source, and do not create a local fork without a named
consumer and falsifier. The curated harness subset named by `harness_skills` in
`skills/manifest.json` and the upstream `harness_paths` in
`config/upstream-sources.json` are materialized into the
generated, provenance-marked `.agents/skills/` by `krn skills export`
(the full pin stays in `config/upstream-sources.json`); regenerate instead of
editing, and `npm run skills:check` fails on a foreign destination, a stale upstream pin (against `config/upstream-sources.json`), or an exported KRN skill whose bytes differ from its source; upstream byte integrity is verified at export time against the pinned checkout (below), not re-verified at check time. `krn.commit` records the source HEAD when the export ran, which is the parent when the export accompanies a source change, so treat it as provenance, not a reproducible revision. `retired_skills` records KRN-owned skills this repository no longer ships; it does not retract an upstream skill a pin still delivers, and it never removes an entry from the generated `.agents/skills/` export — retiring an exported skill means editing `harness_skills` and the pin, then re-exporting.

Export-time upstream checks verify every *present* file against the pinned blob and reject symlinks, gitlinks, and untracked files, but they iterate the exported set, so a sparse or `skip-worktree` upstream checkout that silently omits a pinned file is not detected; a byte-complete checkout of the pinned commit is a precondition. The export marker and `skills:check` digests also cover path and bytes but not the executable bit, so mode drift is invisible. A dirty-source export is recorded and only warns at check time, so a committed export generated from a dirty tree can pass with a warning. `install` validates that each declared runtime path exists and contains no symlink/gitlink, but not that it is a regular file, so a declared directory injects its whole subtree into the release; an absent or empty `harness_skills` fails the check instead of silently disabling the exported-equals-manifest equality.

### Source-only packs

There are no source-only packs on this core branch. Domain-specific packs stay
on their own branch until a separate promotion decision is made.

Skill frontmatter descriptions route admission; `agents/openai.yaml` owns the
interface and invocation policy. README is the only human skill catalog; there
are no hand-maintained per-skill mirror pages.

## Requirements

Linux or macOS with Node.js >= 22 (`.nvmrc` pins 22), `git`, `bash`, `tar`,
`python3` (runtime for the installed PreToolUse hook and its tests), and POSIX symlink support. Windows is unsupported: the
installer and hooks rely on symlinks, `bash`, and `tar`.

## Install

```bash
npm run validate
krn install plan --source /absolute/path/to/clean/krn-codex-skills
krn install apply --source /absolute/path/to/clean/krn-codex-skills --yes
krn doctor
```

The capsule reader commands named in `config/AGENTS.md`
structurally validate a repository's file-backed
outcome capsule and print a capsule skeleton with the mechanical fields (HEAD,
dirty scope, active runs) already filled, plus a deterministic restart brief that
diffs the recorded capsule against live repository state. All are read-only and
never write the capsule.
`krn install plan` is read-only. `install apply` accepts only a clean
Git checkout at its checked-out commit, validates that exact tree, copies an
explicit manifest-owned runtime closure to
`$CODEX_HOME/krn/releases/<commit>/`, hashes it, then atomically switches
`$CODEX_HOME/krn/current`. Stable skill, bin, global-contract, and hook links
lead through `current`, never to the source checkout. Existing matching
releases are idempotent; a mismatched or tampered release fails closed. The
installer links only manifest-owned skills into `~/.agents/skills`, the CLI, and
catalog compatibility shim into `~/.local/bin`, the global contract into Codex
and opencode, the adapter plugin into `~/.config/opencode/plugins/`, and one
deterministic `PreToolUse` guard. It
applies path-aware policy to recognized direct `rm`, denies recognized literal
non-dry-run `git clean`, blocks exact literal quarantine references and patch
targets, and denies unsupported shell composition only when it contains the
same literal risk. It does not interpret shell execution; runtime-built,
sourced, or obfuscated behavior remains governed by the global contract. Bare,
uncomposed `echo`/`printf` and literal-risk words inside simple read-only
inspection commands (for example `grep rm file`) are treated as inert text. The
installer refuses foreign collisions and archives only its previous managed
links while it reconciles them through `current`. `scripts/install.sh` remains
a one-release `check`/`install` compatibility shim; it invokes the same CLI, and
`npm run install:check` runs `check`.

`krn install prune --keep N` removes superseded releases while keeping the current one and the N newest, and never removes a release a managed link still resolves into. Use `krn install check` for filesystem state and `krn doctor` when
you need the distinction between an installed filesystem snapshot, a broken or
foreign link (a legacy mutable-source link is reported as
`legacy_mutable_source`; `install apply` migrates it), and
unknown/stale session loading.
Start a fresh Codex session after installation. Discovery is session-scoped.
`setup-repository-workflow`, `opencode-second-opinion`, `ask-gpt`, and `unslop`
require an explicit `$skill-name` attachment. Descriptions route the task;
manifest invocation mode decides auto-attachment, and many composed upstream
owners are explicit-only — including `ask-matt`, `implement`,
`improve-codebase-architecture`, `to-spec`, `to-tickets`, `triage`, `handoff`,
and `wayfinder`.

For a disposable end-to-end proof, run `npm run test:bootstrap`; it installs a
temporary release and drives the linked CLI against
[`test/bootstrap-fixture`](test/bootstrap-fixture/). The installer
validates the exact clean source checkout before a release is created; refreshes
should still run `npm run validate` first.

See [migration](docs/migration.md) for ownership, retirement, backup, and
rollback guarantees.

## Repository setup and working state

`$setup-repository-workflow` writes one managed block into an existing root
instruction owner, `.krn/runs/.gitignore`, and a `docs/research/workflow-lessons.md`
memory page (created only when absent). In an empty repository it first
bootstraps a thin `AGENTS.md`, and reports the three managed paths. It names tracker state — including `none` — and
the context layout directly; `CONTEXT.md`, ADRs, and other research pages appear later
only when a real decision earns them.

`$opencode-second-opinion` stores its transient brief and response at
`.krn/runs/opencode-second-opinion/<run-id>/`. It always receives the target
directory as an absolute path; there is no implicit home fallback.

## Capability catalog

```bash
krn capability inventory
krn capability usage --days 30
krn capability plan lean
krn capability apply lean
```

Named profiles keep optional integrations intentional. Usage evidence never
disables a capability automatically. See [capabilities](docs/capabilities.md).

## Proof

The installed `config/AGENTS.md` owns the `0/1/N` proof budget. README records
the operator entrypoints; it does not duplicate the execution policy.

## Repository map

```text
AGENTS.md             source-repository editing contract
config/               installed global contract and hook configuration
skills/               canonical workflow owners and direct resources
.agents/skills/       generated skill export, verified by skills:check
scripts/              CLI, hooks, and lib/ grouped by owner (audit, catalog, conformance, contract, install, kernel, lessons, rules, state, support, ticket)
test/                 suites for architecture, audit, bootstrap-fixture, catalog, cli, conformance, contract, install, lane, lessons, opencode, repro, rules, state, support, and ticket, plus top-level ci-workflow, hooks-guard, setup-workflow, and skill-scripts
.github/              CI workflow that runs the change-contract and gate suites
CONTEXT.md            compact current vocabulary and knowledge index
docs/research/        living source-backed synthesis
docs/adr/             earned durable decisions
docs/capabilities.md  global capability profiles and evidence states
docs/migration.md     installation ownership, retirement, and rollback
.krn/runs/            ignored resumable working state
```
