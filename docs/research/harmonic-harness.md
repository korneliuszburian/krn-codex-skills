# KRN harmonic harness

Status: **adopted architecture map; selected mechanisms remain lab-test or
deferred**. Verified 2026-09-10. This page is the canonical synthesis for the
whole KRN harness: upstream workflow composition, local owners, context
continuity, evidence, target-repository setup, and optional task-graph adapters.
It is not a second skill catalog and it does not authorize installing an
upstream experiment or a third-party tracker.

## Decision question and consumers

How can KRN remain one coherent multi-stage system while keeping every
workflow, memory artifact, tool, and evaluator inside one non-overlapping
authority model?

Named consumers:

- `CONTEXT.md` and `README.md` — the compact operator map and routing language;
- `delivery-loop` — outcome state, handoffs, authority, and cleanup;
- `setup-repository-workflow` — target-repository bootstrap and tracker branch;
- `evals/` — falsifiers for routing, installation, setup, and harness behavior;
- future domain-specific packs — separate branches until a named consumer and
  behavioral proof exist.

## The one spine

KRN is a typed spine, not a central manager and not a mandatory sequence. The
smallest unresolved uncertainty selects one owner; settled phases are skipped.

```text
intent
  → current uncertainty
  → one workflow owner
  → one bounded decision or mutation
  → observable evidence
  → independent review when required
  → truthful disposition and publication state
  → compact knowledge promotion (only when earned)
```

The lifecycle envelope is owned by `$delivery-loop`; the selected specialist
owns its procedure. A claim, issue status, test pass, model opinion, or
successful install is evidence about one boundary, never implicit permission
for another boundary.

```text
context layer      minimal, provenance-bound current truth
skill layer        routing and one repeatable procedure
execution layer    one bounded change or decision
evidence layer     repository / host / browser observation
review layer       independent interpretation against intent
knowledge layer    accepted mechanisms with source and falsifier
authority layer    user, Git, tracker, publication, and install permissions
```

The main forbidden shape is a component that simultaneously routes, stores
memory, plans, edits, evaluates, and publishes. Such a “super-harness” makes
ownership and failure recovery unauditable.

## Complete skill map

### Admission and orientation

| Owner | Starts when | Produces | Stops at |
|---|---|---|---|
| `ask-matt` (upstream) | the user asks which workflow fits | one route to the smallest owner | route selected; no work is performed |
| `wayfinder` (upstream) | an effort is foggy, durable, and spans sessions | a map with decisions, blockers, and a frontier | one next owner or a terminal map |
| `triage` (upstream) | an issue or external request arrives | category, state, and a recommendation | human decision or explicit close |
| `grill-with-docs` (upstream) | a plan needs repository vocabulary | sharpened terms, `CONTEXT.md`, and rare ADRs | shared understanding and named next consumer |
| `grilling` / `grill-me` (upstream) | a user-owned choice is still ambiguous | frontier questions and confirmed answers | the user confirms the frontier is empty |
| `wait-what` (upstream) | the agent misunderstood the request | a plain-language re-pitch | the user confirms understanding |
| `teach` (upstream) | a user wants a stateful learning workspace | mission, lessons, resources, and learning records | the learning mission or session ends; it is not engineering memory |
| `to-questionnaire` (upstream) | missing knowledge belongs to another person | a questionnaire document | questions are ready for that person; it does not decide their answers |

### Evidence and design

| Owner | Starts when | Produces | Stops at |
|---|---|---|---|
| `research` (upstream) | external facts must be gathered | one cited source-backed artifact | facts are handed to the named decision owner |
| `source-to-decision` (KRN) | evidence must change a named local decision | `adopt`, `reject`, `lab-test`, or `defer` plus falsifier | the consumer and decision are explicit |
| `prototype` (upstream) | one disposable runnable experiment can answer a question | validated logic/UI artifact and verdict | the question is answered; no unapproved residue |
| `domain-modeling` (upstream) | terms, scenarios, or a hard decision are contested | canonical vocabulary or rare ADR | one term/decision is resolved |
| `codebase-design` (upstream) | a seam, interface, or ownership boundary is unclear | a deep-module boundary and first slice | boundary selected or question escalated |
| `improve-codebase-architecture` (upstream) | a codebase health/deepening survey is requested | temporary candidate report | user selects a candidate; it does not mutate by itself |
| `target-repo-work` (KRN) | work crosses into another checkout | identity, authority, dirty-state, and allowed paths | target operation and readback are complete |
| `typescript-engineering` (KRN companion) | TypeScript inference, compiler, or public API mechanics matter | type-level boundary and proof | caller-visible behavior is proven |

### Planning and execution

| Owner | Starts when | Produces | Stops at |
|---|---|---|---|
| `to-spec` (upstream) | shared understanding is ready for a durable spec | a seam-confirmed implementation spec | spec is published to its configured authority |
| `slice-work` (KRN) | a settled spec needs executable decomposition | vertical slices or migration stages with dependencies | slice granularity and edges are accepted |
| `to-tickets` (upstream) | a tracker-backed ticket graph is requested | executable tickets and blockers | human approves granularity and publication |
| `implement` (upstream) | one production slice is clear and authorized | code plus TDD/proof and review handoff | fixed-point review and commit boundary |
| `tdd` (upstream companion) | test-first implementation is required | red/green evidence at the public seam | behavior is covered; it does not own lifecycle |
| `diagnosing-bugs` (upstream) | a hard bug, regression, or performance issue exists | minimized repro, hypothesis loop, repair, regression test | cause is proven or diagnosis is bounded |
| `setup-repository-workflow` (KRN, explicit) | a target repo needs the thin local contract | managed `AGENTS.md` block and `.krn/runs/.gitignore` | ownership and byte readback pass |
| `setup-matt-pocock-skills` (upstream) | a repository needs the upstream workflow environment | tracker/label/context pointers and setup verification | repository prerequisites are confirmed; it does not install KRN |
| `resolving-merge-conflicts` (upstream) | an active merge or rebase has conflicts | resolved operation plus focused checks | the operation completes; it never aborts or publishes by itself |
| `wizard` (upstream) | only a human can perform provisioning or cutover | statically checked interactive instructions | human-only steps are handed off |

### Proof, review, and continuity

| Owner | Starts when | Produces | Stops at |
|---|---|---|---|
| `code-review` (upstream) | a fixed diff/PR/fingerprint is reviewable | separate Standards and Spec findings | both axes are green or `NEEDS_REVIEW` |
| `opencode-second-opinion` (KRN, explicit) | one bounded advisory opinion is requested | response/failure evidence, never a diff | response is attributable and locally verified |
| `unlazy` (KRN, explicit) | a long task needs a completion ledger | gates, command evidence, and re-verification | all approved gates pass or a blocker is named |
| `handoff` (upstream) | context must cross a session boundary | a portable temporary handoff | successor accepts the condensed truth |
| `delivery-loop` (KRN) | one accepted outcome spans owners/sessions | capsule, transitions, authority, cleanup, publication state | complete, blocked, deferred, superseded, or abandoned |
| `writing-for-agents` (upstream reference) | an agent-facing contract is authored | pointers, hierarchy, criteria, and pruning rules | document is a small routing interface |
| `managing-codex-capabilities` (KRN) | global skills/plugins/MCP/profile state changes | audited capability inventory and evidence-bounded plan | explicit profile authority is read back |
| `unslop` (KRN, explicit) | prose drift needs an audit or rewrite | semantic-preserving prose repair | facts/technical fragments remain protected |

Productivity owners that are not engineering phases (`teach` and
`to-questionnaire`) remain independent stateful or human-information
workflows. They do not become hidden memory or planning layers.

## Context and memory contract

Research on context engineering, long-running agents, and memory converges on
small, selective, provenance-bound context rather than a larger prompt or an
automatic database. KRN therefore keeps four distinct artifact classes:

```text
CONTEXT.md              compact shared map and vocabulary
docs/research/          source-backed synthesis and dispositions
docs/adr/               rare consequential trade-offs
.krn/runs/...            ignored working state owned by its workflow
delivery-loop capsule   one living outcome record with one writer
```

A working reflection, reviewer packet, model response, or task status is not
durable knowledge by itself. Promotion requires a named future consumer, one
canonical destination, and a cleanup or supersession rule. Durable decisions
must carry source, mechanism, limitation, owner, and falsifier. This prevents
feedback generated by the same model from becoming self-approved truth.

The capsule compiles only what the next owner needs: acceptance, current owner,
repository fixed point, authority, evidence, non-proofs, review disposition,
unknowns, durable pointers, and next action. Native Goal/tracker state remains
current continuation authority; the capsule is not a generic memory service.

## Condensing expert material into skills

The reusable unit is a mechanism, not a lesson, slogan, transcript, or copied
course chapter. The safe distillation pipeline is:

```text
source material
  → candidate mechanisms
  → deduplicate and test boundaries
  → one representative example + hard negative
  → named owner and trigger
  → falsifier on a real task
  → promote only after evidence
```

Each candidate reference should answer:

```text
Mechanism      what transferable causal relation is present?
Use when       what observable condition selects it?
Do             what decision should the agent make?
Avoid          what tempting choice is wrong?
Example        one original representative case
Counterexample one case where it must not apply
Owner          which skill or companion consumes it?
Falsifier      what evidence could disprove the choice?
```

`SKILL.md` remains the small routing/procedure boundary. Mechanisms and
examples belong in direct `references/`; deterministic operations belong in
scripts. A reference is not promoted because it sounds wise or because a model
repeats it. It is promoted when a new task beats a baseline without creating a
trigger collision, owner collision, or evidence gap.

## Beads boundary

Beads is a candidate **task-graph adapter**, not a replacement harness. Its
durable issues, blocking edges, `ready`, atomic claim, and supersession
relationships can serve a future `wayfinder`/tracker branch. KRN retains:

```text
Beads              tasks, dependencies, claims, queue state
delivery-loop      outcome truth, authority, publication, capsule
skills             procedure and decision ownership
evals              admissible evidence and grading
CONTEXT/research   durable semantic knowledge
```

The first Beads experiment must use an audited pinned binary in a disposable
target repository, skip its default instruction/hook mutations, read back every
changed path, and compare against the current capsule baseline. It must test
duplicate claims, blocker release, reset recovery, false completion, and
operator/token overhead. Dolt remote sync, server mode, formulas/molecules, and
Codex hook setup stay deferred until a local consumer and authority contract
exist. See the detailed [Beads audit](beads-task-system.md).

## Current dispositions and falsifiers

| Mechanism | Decision | Falsifier that reopens it |
|---|---|---|
| Pinned upstream composition | adopt | a refresh changes a consumed skill, routing, invocation, or ownership contract |
| New upstream experimental skills | defer/reject | a real routing case has a unique owner and a passing collision experiment |
| Acceptance locks and direct-seam proof | adopt as local invariant | a simpler existing evaluator catches the same contradictions with equal reliability |
| Generic vector/SQLite memory | defer | multi-session trials show capsule/context loss that links and compact files cannot repair |
| Beads core graph | lab-test | claims duplicate, blockers do not release, or tracker state is mistaken for completion |
| OpenCode advisory transport | lab-test | bounded-run tests fail timeout, attribution, or scope/readback invariants |

Every proposed addition must name one consumer, one owner, one stopping
condition, one allowed path, and one falsifier. If it cannot, it remains raw
working material or is deleted.

## Sources and limits

The synthesis is based on the official current
[mattpocock/skills tree](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015)
and its [change history](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/CHANGELOG.md),
the [Agent Skills standard](https://github.com/agentskills/agentskills),
[Anthropic harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps),
[Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
[Anthropic eval guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents),
[OpenAI harness engineering](https://openai.com/index/harness-engineering/),
the primary papers [ReAct](https://arxiv.org/abs/2210.03629),
[Voyager](https://arxiv.org/abs/2305.16291),
[Reflexion](https://arxiv.org/abs/2303.11366),
[Self-Refine](https://arxiv.org/abs/2303.17651),
[MemGPT](https://arxiv.org/abs/2310.08560),
[Self-Instruct](https://arxiv.org/abs/2212.10560),
[Distilling Step-by-Step](https://arxiv.org/abs/2305.02301),
[DSPy](https://arxiv.org/abs/2310.03714), and the official
[Beads repository](https://github.com/gastownhall/beads).

These sources establish mechanisms and design hypotheses, not proof that KRN
or any future domain-specific pack improves a model. KRN's own fixtures and
experiments remain the acceptance evidence. Recheck moving upstream pages,
issue proposals, model behavior, and third-party commands before adoption.
