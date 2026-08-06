# KRN Skills

Production-first Codex workflows with one owner per repeated process. Global
policy stays small; product language stays with the product; working context is
compiled into a few semantic artifacts instead of accumulated as reports.

## Workflow

```mermaid
flowchart LR
  INPUT["request + current repository truth"] --> GATE{"smallest unresolved uncertainty"}
  GATE -->|explicit tracker-backed orientation| WAY["explicit $wayfinder"]
  GATE -->|one decision| DECIDE["typed decision owner"]
  GATE -->|spec or decomposition missing| SHAPE["$to-spec or $slice-work"]
  GATE -->|clear production slice| IMPL["$implement"]
  GATE -->|unknown cause| DIAG["$diagnosing-bugs"]
  GATE -->|fixed review surface| REVIEW["$code-review"]
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
resolved phase: a clear slice enters `$implement`, and a fixed diff, PR, or
fingerprinted working tree enters `$code-review`. The typed decision owner is
`$domain-modeling` for a user-owned choice or contested concept,
`$source-to-decision` when external evidence must change a named local
decision, `$prototype` for a disposable runnable experiment, or
`$codebase-design` for a seam or ownership decision. Each returns a bounded
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
| [`implement`](skills/engineering/implement/SKILL.md) | model or user | one scoped production slice and proportional proof |
| [`diagnosing-bugs`](skills/engineering/diagnosing-bugs/SKILL.md) | model or user | unknown failures, flakes, regressions, and slowness |
| [`code-review`](skills/engineering/code-review/SKILL.md) | model or user | read-only Standards and Spec review of one fixed point |
| [`codebase-design`](skills/engineering/codebase-design/SKILL.md) | model or user | architecture friction, ownership, and public seams |
| [`domain-modeling`](skills/engineering/domain-modeling/SKILL.md) | model or user | user-owned choices, contested concepts, and earned ADRs |
| [`source-to-decision`](skills/engineering/source-to-decision/SKILL.md) | model or user | one source-backed disposition for a named local consumer |
| [`prototype`](skills/engineering/prototype/SKILL.md) | model or user | one disposable runnable answer to a design question |
| [`to-spec`](skills/engineering/to-spec/SKILL.md) | model or user | a settled conversation compressed into one destination-first spec |
| [`to-questionnaire`](skills/engineering/to-questionnaire/SKILL.md) | explicit only | a user-blocked decision turned into a third-party questionnaire |
| [`slice-work`](skills/engineering/slice-work/SKILL.md) | model or user | vertical implementation slices or expand-contract migration stages |
| [`wayfinder`](skills/engineering/wayfinder/SKILL.md) | explicit only | a durable typed-frontier map for genuinely foggy multi-session work |
| [`delivery-loop`](skills/engineering/delivery-loop/SKILL.md) | model or user | lifecycle truth and handoffs for one agreed end-to-end outcome |
| [`target-repo-work`](skills/engineering/target-repo-work/SKILL.md) | model or user | identity and authority when work crosses into another checkout |
| [`setup-repository-workflow`](skills/engineering/setup-repository-workflow/SKILL.md) | explicit only | one-time adoption or repair of a thin local contract |
| [`typescript-engineering`](skills/engineering/typescript-engineering/SKILL.md) | model or user | TypeScript inference, public APIs, compiler mechanics, and proof |
| [`opencode-second-opinion`](skills/advisory/opencode-second-opinion/SKILL.md) | explicit only | bounded DeepSeek opinion on one explicit path, without diffs |
| [`wait-what`](skills/advisory/wait-what/SKILL.md) | explicit only | a re-pitch of a message that did not land, in simplified technical English |
| [`managing-codex-capabilities`](skills/meta/managing-codex-capabilities/SKILL.md) | model or user | global skill, plugin, MCP, and profile control |
| [`writing-for-agents`](skills/meta/writing-for-agents/SKILL.md) | model or user | agent-facing documents; skill routing, information shape, validation, and pruning |

Descriptions and `agents/openai.yaml` are the routing authority. README is the
only human skill catalog; there are no hand-maintained per-skill mirror pages.

## Install

```bash
npm run validate
scripts/install.sh check
scripts/install.sh install
```

The installer links only manifest-owned skills into `~/.agents/skills`, the
catalog executable into `~/.local/bin`, the global contract into Codex, the
same semantic core into Claude, and one deterministic `PreToolUse` guard. It
applies path-aware policy to recognized direct `rm`, denies recognized literal
non-dry-run `git clean`, blocks exact literal quarantine references and patch
targets, and denies unsupported shell composition only when it contains the
same literal risk. It does not interpret shell execution; runtime-built,
sourced, or obfuscated behavior remains governed by the global contract. Only
bare, uncomposed `echo` and `printf` are treated as inert risk text. The
installer refuses foreign collisions. Named legacy and retired entries are
archived only with explicit authority:

```bash
env KRN_ARCHIVE_LEGACY=1 KRN_REPLACE_GLOBAL_AGENTS=1 \
  KRN_REPLACE_GLOBAL_CLAUDE=1 KRN_REPLACE_GLOBAL_HOOKS=1 \
  scripts/install.sh install
```

Run `check` again and start a fresh Codex session after installation. Discovery
is session-scoped. `setup-repository-workflow`, `wayfinder`, and
`opencode-second-opinion` require an explicit `$skill-name` attachment.

See [migration](docs/migration.md) for ownership, retirement, backup, and
rollback guarantees.

## Repository setup and working state

`$setup-repository-workflow` writes one managed block into an existing root
instruction owner plus `.krn/runs/.gitignore`. In an empty repository it first
bootstraps thin `AGENTS.md` and a `CLAUDE.md` symlink to that same owner, and
reports all three changed paths. It names tracker state — including `none` — and
the context layout directly; `CONTEXT.md`, ADRs, and research pages appear later
only when a real decision earns them.

`$opencode-second-opinion` stores its transient brief and response at
`.krn/runs/opencode-second-opinion/<run-id>/`. It always receives the target
directory as an absolute path; there is no implicit home fallback.

## Capability catalog

```bash
krn-codex-catalog inventory
krn-codex-catalog usage --days 30
krn-codex-catalog plan lean
krn-codex-catalog apply lean
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
