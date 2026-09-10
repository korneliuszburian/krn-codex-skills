# Beads task system: bounded KRN adoption audit

Status: `lab-test`, not installed or enabled. Verified against the official
`gastownhall/beads` repository at commit
[`a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96`](https://github.com/gastownhall/beads/tree/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96),
2026-09-08. This report is an original comparison with KRN's current local
contracts. It does not authorize a Beads installation, repository
initialization, hook setup, remote sync, or task migration.

## Decision question and consumer

Should KRN select Beads as an optional durable task tracker for multi-session
work, while preserving KRN's current Codex-only global lifecycle, immutable
runtime installer, experiment evidence contract, and source-only frontend
package?

The named consumer is the existing `setup-repository-workflow` tracker branch
and its `delivery-loop`/`wayfinder` integration. A possible future consumer is
one isolated bootstrap fixture that can disprove whether Beads can coexist with
KRN-managed `AGENTS.md`, `.krn/runs`, hooks, Git authority, and fixed-point
evidence. The current decision is **lab-test** for the narrow task-graph seam,
**defer** for synchronization and orchestration features, and **reject** for
replacing KRN lifecycle or evidence ownership.

## Source method and fixed point

The source checkout was a clean shallow clone of the official repository and
its default branch was verified with `git ls-remote` before inspection. The
remote `main` resolved to `a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96`, whose
commit date is 2026-09-08. The source inventory and claims below come from
the pinned tree, not from a third-party summary:

- [official README](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/README.md)
- [core issue and dependency model](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/issues.md)
- [dependency and gate semantics](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/dependencies.md)
- [multi-agent coordination](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/multi-agent/coordination.md)
- [multi-repository routing](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/multi-agent/routing.md)
- [Dolt storage architecture](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/architecture/dolt.md)
- [Git integration and hooks](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/reference/git-integration.md)
- [sync contract](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/sync-concepts.md)
- [init safety ADR](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/engdocs/adr/0002-init-safety-invariants.md)
- [events journal](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/reference/events-journal.md)
- [Codex integration](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/integrations/codex.md)
- [official CLI reference](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/CLI_REFERENCE.md)

The local comparison uses the current KRN contracts in
[`delivery-loop`](../../skills/engineering/delivery-loop/SKILL.md),
[`setup-repository-workflow`](../../skills/engineering/setup-repository-workflow/SKILL.md),
[`evals/README.md`](../../evals/README.md), and
[`docs/migration.md`](../migration.md). Those files are the local authority;
Beads documentation is external input, not an instruction to mutate this
repository.

## What Beads actually provides

### Durable graph and ready queue

Beads stores issues with a title, description, type, priority, labels,
assignee, status, timestamps, and optional metadata. Its dependency graph has
blocking and non-blocking edge types. `bd ready` computes open work with no
active blocking dependency; `bd update <id> --claim` atomically sets the
assignee and `in_progress`, and `bd ready --claim --json` combines selection
and claim. Parent-child relationships model epics and subtasks, while
`discovered-from`, `related`, `caused-by`, `validates`, and `supersedes` carry
different non-blocking meanings. These are stated in the [issue model](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/issues.md)
and [dependency reference](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/dependencies.md).

This is materially richer than a local Markdown queue: the graph can answer
the next claimable item and preserve discovery provenance. It is still a
tracker state, not proof that the implementation is correct or that a user
accepted the outcome.

### Storage, sync, and concurrency

The default embedded backend is an in-process Dolt database under
`.beads/embeddeddolt/` and is documented as single-writer. Server mode uses a
Dolt SQL server for concurrent writers. Dolt history is the source of truth
for reads and writes; `.beads/issues.jsonl` is an export for viewers,
interchange, and backup, not the canonical sync channel. Cross-machine sync
uses `bd dolt push` and `bd dolt pull` over a Dolt remote, as described in the
[Dolt architecture](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/architecture/dolt.md)
and [sync concepts](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/core-concepts/sync-concepts.md).

Hash-based IDs reduce collision risk across branches, but do not establish
one KRN writer, grant Git authority, or make two agents safe to mutate the
same source files. Embedded mode's writer lock and server mode's operational
dependency are different deployment contracts and must not be hidden behind a
generic tracker flag.

### Git hooks and agent context

`bd init` normally creates or updates `AGENTS.md`, installs Git hooks, and
creates the Beads workspace. The [Git integration reference](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/reference/git-integration.md)
describes hook chaining, JSONL export, actor trailers, and worktree-aware
installation. `bd setup codex` additionally writes a Beads skill, managed
`AGENTS.md` guidance, `.codex/config.toml`, and Codex hooks; the [Codex guide](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/integrations/codex.md)
describes `SessionStart`, `PreCompact`, `PostCompact`, and
`UserPromptSubmit` behavior around `bd prime`.

This default is unsafe to treat as a harmless plugin install in KRN. KRN owns
the installed global `AGENTS.md`, hook routing, immutable release, and
Codex-only capability projection. Any Beads experiment must use explicit
`--skip-agents --skip-hooks`, inspect every resulting path, and treat a Beads
setup as a separate authority-bearing transition.

### Gates, formulas, molecules, and wisps

Beads supports external-condition gates, declarative formulas, instantiated
molecules, and ephemeral wisps. The [workflow documentation](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/workflows/index.md)
and [molecule model](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/workflows/molecules.md)
describe these as optional layers over the core issue/dependency graph.
They are potentially useful for an orchestrator, but they introduce a second
workflow language, state machine, and lifecycle vocabulary. No KRN consumer
currently needs them.

### Event journal

The events journal is a workspace-wide, ordered stream of committed issue
mutations with resumable sequence cursors. It is off by default, local to one
clone, and retention-bounded. The source explicitly distinguishes it from
fire-and-forget script hooks and per-issue audit history. Its records retain
historical snapshots, so exposing the HTTP endpoint can publish old titles and
descriptions, not just current state. See the [events journal contract](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/reference/events-journal.md).

That could feed an external dashboard, but KRN has no named consumer and must
not enable it merely for observability.

## Mapping to KRN's existing owners

| Need | Beads primitive | KRN owner / boundary | Decision |
|---|---|---|---|
| A durable multi-session work map | epic plus child issues | `wayfinder` map and its configured tracker; Beads may be the storage adapter | **lab-test** |
| Blocking implementation frontier | `blocks` edges and `bd ready` | `slice-work` produces slices; `delivery-loop` selects the next owner | **lab-test** |
| Single claim among workers | atomic `--claim` and assignee | one KRN outcome writer and isolated worktree remain stronger constraints | **lab-test**, never sole safety proof |
| User-owned acceptance and lifecycle | issue status/description | `delivery-loop` capsule, Goal, publication state, and authority state | **reject replacement** |
| Source-backed decision | issue body, comments, labels | `docs/research/` with source, mechanism, falsifier, and disposition | **reject replacement** |
| Experiment protocol/results/grading | issue graph or JSONL | Git-owned `evals/experiments/` with fixed-point review and hashes | **reject replacement** |
| Transient run continuation | wisps or open issues | ignored `.krn/runs/<workflow>/<run-id>/`, owned by creating workflow | **reject replacement** |
| Agent prompt refresh | `bd prime` plus Codex hooks | global KRN AGENTS and explicit hook owners | **reject globally** |
| External CI/PR/timer condition | Beads gate | publication authority and CI/host policy | **defer** |
| Reusable workflow program | formulas/molecules | skills and `slice-work`; no second program language yet | **defer** |
| Cross-repository planning | routing/hydration | `target-repo-work` and explicit tracker authority | **defer** |
| Machine mirror of tracker history | events journal | no current dashboard or mirror consumer | **defer** |

The decisive distinction is that Beads tracks *work items and edges* while
KRN tracks *accepted outcome truth, ownership, evidence, authority, and
publication*. A Beads issue may be one durable pointer inside that envelope;
it cannot become the envelope by implication.

## Candidate dispositions

### 1. Core graph adapter: `lab-test`

**Mechanism:** create an epic-like map, create child issues, add `blocks`
edges, claim atomically, close a child, and query the resulting frontier in
JSON. The KRN consumer is the Beads branch of
`setup-repository-workflow`, plus the `wayfinder` tracker operations already
named by that contract.

**Minimal test:** use a disposable clean repository and an audited pinned
binary. Initialize Beads with agent files and hooks skipped, then apply only
KRN's managed `AGENTS.md` and `.krn/runs/.gitignore`. Create a map and two
children, make one block the other, claim the first, close it, and verify that
the second becomes ready. Run the same operations twice where the contract
claims idempotence. Use two processes to race `bd ready --claim --json` and
verify exactly one claimant wins. Read back Git status, local config, hook
paths, instruction bytes, and Beads paths after every mutation.

**Falsifiers:** any Beads command mutates a KRN-owned instruction or hook
surface despite skip flags; two claimants receive the same issue; a closed
blocker does not release the dependent issue; a missing or stale database is
reported as an empty healthy queue; a second apply changes unrelated bytes; or
the adapter silently treats a tracker write as a lifecycle transition.

**Limit:** this proves only the task graph seam and local coexistence. It does
not prove Dolt remote sync, multi-machine convergence, model routing quality,
or that a Beads queue improves completion.

### 2. Explicit setup boundary: `adopt` only as a guarded future path

**Mechanism:** Beads has explicit setup flags and safety guards, while KRN's
setup contract already states that a new Beads tracker must be initialized
before KRN managed files, with clean state, explicit local commit authority,
version pin, config and hook fingerprints, and post-init readback. This is a
good authority shape, not a reason to run it now.

**Disposition:** **adopt the boundary rule**, conditionally. The future
adapter must never call the default `bd init` or `bd setup codex` blindly.
It must pin an audited `bd` version and checksums, use the exact isolated
initialization sequence, and fail closed on any unexpected `AGENTS.md`, hook,
Git config, HEAD, or `.beads` change. KRN's global immutable installer must
remain the only owner of global Codex skills and hooks.

**Falsifier:** a fixture cannot establish the stated before/after file and Git
authority contract, or an upstream `bd` update changes initialization behavior
without an explicit version-gated test. The adapter then remains deferred.

### 3. Atomic claims: `lab-test`, not a writer protocol

**Mechanism:** Beads documents atomic claim as the preferred self-selection
operation, and merge slots as a serialization primitive for conflict-prone
work in [agent coordination](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/multi-agent/coordination.md).

**KRN use:** test this as a queue-level admission helper for independent
decision or implementation items. Keep KRN's one writer per outcome/worktree,
disjoint allowed paths, fixed-point review, and separate publication
authority. A claim is not permission to edit files, commit, push, merge, or
install.

**Falsifier:** a claim can be duplicated under the selected backend, a worker
can mutate a non-owned path, or a merge slot creates a false sense of source
isolation. Any of these keeps claims advisory and prevents promotion.

### 4. Dolt sync and server mode: `defer`

**Mechanism:** embedded mode is single-writer; server mode adds a Dolt SQL
server for concurrent writers; remote sync is a separate `bd dolt push/pull`
surface. Beads also documents schema-version guards, backups, migrations, and
remote history safety in its [recovery material](https://github.com/gastownhall/beads/blob/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96/docs/recovery/init-safety.md).

**Disposition:** **defer**. KRN is currently a single-operator Codex global
system with no demonstrated need for a shared task database or cross-machine
queue. A server adds process, port/socket, lifecycle, backup, and credential
authority. A Dolt remote adds publication and history exposure separate from
Git publication.

**Reopen only when:** two real KRN workers need the same durable queue across
machines, and a preregistered lab can measure convergence, restart recovery,
schema migration, stale replica behavior, and remote refusal. The lab must
include a no-network and a remote-failure arm.

### 5. `bd prime` and Codex hooks: `reject globally`

**Mechanism:** Beads can inject task context at session start and after
compaction through Codex lifecycle hooks. That is useful for a Beads-owned
project, but it writes another context producer and another hook surface.

**Disposition:** **reject as KRN global behavior**. KRN already has a thin
global instruction core, a delivery capsule, explicit owner routing, and a
strict hook/install contract. Installing Beads' global integration would
duplicate or compete with those owners, and Beads' injected context is not a
substitute for KRN's accepted outcome and authority readback.

**Possible future boundary:** a target repository may opt into Beads-owned
project hooks only after an explicit tracker decision, with KRN global hooks
left untouched and the target's instruction owner preserved. This is a
separate target-repo authority, not a KRN installer feature by default.

### 6. Formulas, molecules, gates, wisps: `defer` or `reject by owner`

Formulas and molecules are plausible abstractions for repeating a graph of
tasks, and gates can model external waiting. However, KRN already has skills
as reusable procedures, `slice-work` as the implementation slicing owner,
`delivery-loop` as the lifecycle envelope, and native Goal/tracker state as
continuation authority. Importing Beads molecules would create a second
procedure compiler and lifecycle vocabulary.

**Disposition:** **defer** formulas, molecules, and gates until one concrete
repeated workflow cannot be expressed by the existing owners. **Reject** wisps
as the default home for KRN continuation: KRN's ignored run directories have
explicit creating-owner cleanup, while a tracker item with ephemeral TTL is
not automatically equivalent to a restart capsule or experiment artifact.

**Falsifier to reopen:** a measured multi-session workflow loses work or
duplicates execution because the current graph cannot represent a required
fan-out/fan-in or external wait, and a bounded Beads prototype resolves it
without duplicating lifecycle truth.

### 7. Events journal: `defer`

The journal's ordered, replayable records could support a mirror or dashboard,
but no KRN consumer currently tails tracker history. It is off by default and
retains historical snapshots that may outlive the current issue state.

**Falsifier to reopen:** a named dashboard, reconciliation service, or audit
consumer needs mutation history and can specify retention, redaction,
checkpoint, truncation, per-replica identity, and HTTP exposure rules. The
first lab must prove idempotent replay and safe re-baselining after retention
truncation. Do not enable the journal to make a generic “status” command look
more complete.

### 8. Multi-repository routing and hydration: `defer`

Beads can route creation by explicit repository, role, or default target, then
hydrate additional repositories into a unified view. This could be useful if
KRN begins coordinating several product repositories. It also creates risks of
writing to the wrong database, stale hydrated exports, and cross-repository
dependency ambiguity.

**Disposition:** **defer**. KRN's `target-repo-work` requires explicit
repository identity and authority before crossing a checkout. A future
multi-repo lab must prove that `bd where`, explicit `--repo`, routing config,
and discovered-work inheritance cannot send a write to the wrong owner.

## Bootstrap fixture design

The smallest useful fixture should have no network dependency after the
versioned binary is supplied. It should be a temporary clean Git repository
with:

1. a foreign `LOCAL.md`, a KRN-managed `AGENTS.md` or an absent instruction
   owner, a foreign Git hook, and a pre-existing local Git config;
2. a Beads initialization step run only with explicit skip flags and a pinned
   version, with before/after fingerprints of `HEAD`, status, config, hooks,
   instructions, `.gitignore`, and `.beads`;
3. KRN's repository setup apply with `--tracker beads`, then a second apply;
4. a map/epic, two dependent children, JSON reads, atomic claim race, close,
   and ready-frontier readback;
5. a forced failed tracker operation or unavailable backend, verifying that
   the KRN capsule and managed instruction remain truthful and that no partial
   task graph is interpreted as accepted work;
6. an explicit assertion that no global runtime home, Codex capability index,
   installed skill, frontend source-only package, or hook outside the target
   repository is touched.

The fixture must not test a real remote, use operator credentials, install a
system binary, or commit raw databases. If Beads creates a local commit during
initialization, the fixture must record that as an explicitly authorized
tracker transition and test its exact scope. If the command changes any other
file or config key, the fixture fails closed.

## Final recommendation

Do not add Beads to KRN's global runtime or install its Codex setup. The useful
part is narrower: an optional tracker adapter for a real multi-session
Wayfinder map, with atomic claims and dependency-aware `ready` as its public
seam. Prove that seam first in the bootstrap fixture, behind an audited binary
version and an explicit authority boundary. Keep the following ownership map
invariant:

```text
Beads       -> durable task records, edges, claims, tracker readback
Wayfinder   -> map semantics and decision frontier
Delivery    -> accepted outcome, sole writer, handoffs, evidence, authority,
               publication state, Goal/capsule lifecycle
Experiments -> Git-owned protocol, raw admissible outputs, grading, hashes,
               fixed-point review
Codex       -> KRN global skills, instructions, hooks, immutable release
```

Reopen this report when a concrete tracker consumer exists, a second worker
needs shared durable queue state, or the fixture falsifies an assumption above.
Until then, the correct state is **deferred integration with a bounded
lab-test**, not adoption by installation or by copying Beads' agent setup.
