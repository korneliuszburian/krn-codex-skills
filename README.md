# KRN Skills

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
  PROOF -->|non-trivial, requested, or lifecycle envelope active| REVIEW
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
`prototype` for a disposable runnable experiment, or `codebase-design` for a
seam or ownership decision. Each returns a bounded
result to the current owner; none becomes a mandatory pipeline stage.

`target-repo-work` wraps another checkout. `typescript-engineering` is a
language companion. `opencode-second-opinion` is an explicit advisory side path.
Setup, capability management, and skill authoring remain separate owners. The
evidence, admission matrix, and lifecycle invariants live in
[the orchestration synthesis](docs/research/orchestration.md).

## Compact context spine

```mermaid
flowchart TD
  GOAL["accepted request / native Goal<br/>+ tracker when configured"] --> LOOP["$delivery-loop<br/>sole capsule writer"]
  LOOP --> CAPSULE["living outcome capsule"]
  CAPSULE --> OWNER["one current workflow owner"]
  OWNER --> EVIDENCE["repository state + falsifying evidence"]
  EVIDENCE --> LOOP
  CAPSULE --> RUNS[".krn/runs/delivery-loop/<br/>&lt;outcome-id&gt;/state.md"]
  CAPSULE --> CLEANUP["owned specialist-run<br/>cleanup obligations"]
  CLEANUP -->|consumer finishes or Goal closes| DELETE
  EVIDENCE --> GATE{"consumer + destination +<br/>cleanup / supersession?"}
  GATE -->|shared outcome state, when configured| TRACKER["configured tracker"]
  GATE -->|shared language| CONTEXT["CONTEXT.md"]
  GATE -->|consequential trade-off| ADR["docs/adr/"]
  GATE -->|source-backed decision| RESEARCH["docs/research/"]
  GATE -->|no| DELETE["keep transient, then delete"]
```

`$delivery-loop`'s named sole writer rewrites the capsule at owner and context
boundaries. Other workflows return evidence to that writer or continue through
the native Goal/tracker; they do not create another capsule. Git history is the
chronological log; raw transcripts, prompts, and reviewer packets do not become
documentation by default. When no tracker is configured, the accepted request or
native Goal plus capsule, repository, and host readback carry current truth; no
tracker capability is emulated.

## Skills

| Skill | Invocation | Owns |
|---|---|---|
| [`source-to-decision`](skills/engineering/source-to-decision/SKILL.md) | model or user | one source-backed disposition for a named local consumer |
| [`slice-work`](skills/engineering/slice-work/SKILL.md) | model or user | vertical implementation slices or expand-contract migration stages |
| [`delivery-loop`](skills/engineering/delivery-loop/SKILL.md) | model or user | lifecycle truth and handoffs for one agreed end-to-end outcome |
| [`target-repo-work`](skills/engineering/target-repo-work/SKILL.md) | model or user | identity and authority when work crosses into another checkout |
| [`setup-repository-workflow`](skills/engineering/setup-repository-workflow/SKILL.md) | explicit only | one-time adoption or repair of a thin local contract |
| [`typescript-engineering`](skills/engineering/typescript-engineering/SKILL.md) | model or user | TypeScript inference, public APIs, compiler mechanics, and proof |
| [`opencode-second-opinion`](skills/advisory/opencode-second-opinion/SKILL.md) | explicit only | bounded independent-model opinion on one explicit path, without diffs |
| [`managing-codex-capabilities`](skills/meta/managing-codex-capabilities/SKILL.md) | model or user | global skill, plugin, MCP, and profile control |
| [`unlazy`](skills/meta/unlazy/SKILL.md) | explicit only | machine-checked completion gates for long or multi-phase work |
| [`unslop`](skills/meta/unslop/SKILL.md) | explicit only | audit or rewrite robotic prose without semantic drift |

### Source-only packs

The frontend package is not installed before fresh behavioral proof. Its
validated source-only packs are
[`frontend-discovery`](skills/frontend/frontend-discovery/SKILL.md),
[`frontend-authoring`](skills/frontend/frontend-authoring/SKILL.md),
[`frontend-cube-css`](skills/frontend/frontend-cube-css/SKILL.md), and
[`frontend-visual-review`](skills/frontend/frontend-visual-review/SKILL.md).
Promotion moves an accepted pack into the installable catalog in a later fixed
point. `frontend-cube-css` additionally requires an authorized migration of the
incumbent global `cube-css`; this source state neither retires nor replaces it.

The shared engineering and productivity flow (`ask-matt`, `wayfinder`,
`to-spec`, `to-tickets`, `implement`, `diagnosing-bugs`, `research`,
`prototype`, `codebase-design`, `improve-codebase-architecture`,
`resolving-merge-conflicts`, `code-review`, `domain-modeling`, `tdd`, `triage`,
`wizard`, `grill-with-docs`, `grill-me`, `grilling`, `handoff`, `teach`,
`to-questionnaire`, `wait-what`, `writing-for-agents`, and
`setup-matt-pocock-skills`) is **composed from a clean checkout of the
upstream [`mattpocock/skills`](https://github.com/mattpocock/skills) set at the
commit pinned by `config/upstream-sources.json`, not owned here** — do not use a
moving `npx skills add` result as the KRN source. This repo owns only the decisions
and lifecycle envelopes listed above; lab measurement found no advantage of a
hand-forked copy over upstream or over no skill
([`skills-3arm-lab`](docs/research/skills-3arm-lab.md); its raw run data is
retained in the private content-addressed archive named by that experiment).
Only `diagnosing-bugs` was directly measured; the broader upstream composition
is a policy decision constrained by that limited result, not a claim that every
skill has been benchmarked.

Descriptions and `agents/openai.yaml` are the routing authority. README is the
only human skill catalog; there are no hand-maintained per-skill mirror pages.

## Install

```bash
npm run validate
krn-codex install plan --source /absolute/path/to/clean/krn-codex-skills
krn-codex install apply --source /absolute/path/to/clean/krn-codex-skills --yes
krn-codex doctor
```

`krn-codex install plan` is read-only. `install apply` accepts only a clean
Git checkout at its checked-out commit, validates that exact tree, copies an
explicit manifest-owned runtime closure to
`$CODEX_HOME/krn/releases/<commit>/`, hashes it, then atomically switches
`$CODEX_HOME/krn/current`. Stable skill, bin, global-contract, and hook links
lead through `current`, never to the source checkout. Existing matching
releases are idempotent; a mismatched or tampered release fails closed. The
installer links only manifest-owned skills into `~/.agents/skills`, the CLI,
catalog compatibility shim, and neutral browser-evidence executables into
`~/.local/bin`, the global contract into Codex, and one deterministic
`PreToolUse` guard. It
applies path-aware policy to recognized direct `rm`, denies recognized literal
non-dry-run `git clean`, blocks exact literal quarantine references and patch
targets, and denies unsupported shell composition only when it contains the
same literal risk. It does not interpret shell execution; runtime-built,
sourced, or obfuscated behavior remains governed by the global contract. Only
bare, uncomposed `echo` and `printf` are treated as inert risk text. The
installer refuses foreign collisions and archives only its previous managed
links while it reconciles them through `current`. `scripts/install.sh` remains
a one-release `check`/`install` compatibility shim; it invokes the same CLI.

Use `krn-codex install check` for filesystem state and `krn-codex doctor` when
you need the distinction between an installed filesystem snapshot, a broken or
foreign link, a legacy mutable source link, and unknown/stale session loading.
Start a fresh Codex session after installation. Discovery is session-scoped.
`setup-repository-workflow`, `opencode-second-opinion`, `unlazy`, and `unslop`
require an explicit `$skill-name` attachment; the composed upstream
`wayfinder` is explicit-only in that set.

For a disposable end-to-end proof, run `npm run test:bootstrap`; it installs a
temporary release and drives the linked CLI against
[`evals/codex-bootstrap-fixture`](evals/codex-bootstrap-fixture/). The installer
validates the exact clean source checkout before a release is created; refreshes
should still run `npm run validate` first.

See [migration](docs/migration.md) for ownership, retirement, backup, and
rollback guarantees.

## Repository setup and working state

`$setup-repository-workflow` writes one managed block into an existing root
instruction owner plus `.krn/runs/.gitignore`. In an empty repository it first
bootstraps a thin `AGENTS.md`, and reports the two managed paths. It names tracker state — including `none` — and
the context layout directly; `CONTEXT.md`, ADRs, and research pages appear later
only when a real decision earns them.

`$opencode-second-opinion` stores its transient brief and response at
`.krn/runs/opencode-second-opinion/<run-id>/`. It always receives the target
directory as an absolute path; there is no implicit home fallback.

## Capability catalog

```bash
krn-codex capability inventory
krn-codex capability usage --days 30
krn-codex capability plan lean
krn-codex capability apply lean
```

Named profiles keep optional integrations intentional. Usage evidence never
disables a capability automatically. See [capabilities](docs/capabilities.md).

## Proof budget

| Budget | Use |
|---|---|
| `0` | mechanical, documentation, topology, type-only, or already-covered work |
| `1` | one changed runtime contract, validator, migration, authority rule, or reproduced bug |
| `N` | distinct acceptance requirements with distinct failure modes |

Broad suites are completion evidence, not the inner loop.
Every pull request runs this full repository proof once on its fixed revision.

## Repository map

```text
AGENTS.md       source-repository editing contract
config/         installed global contract and hook configuration
skills/         canonical workflow owners and direct resources
evals/          routing cases
scripts/        deterministic validation, installation, hooks, and catalog
CONTEXT.md      compact current vocabulary and knowledge index
docs/research/  living source-backed synthesis
docs/adr/       earned durable decisions
.krn/runs/      ignored resumable working state
```
