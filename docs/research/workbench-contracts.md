# KRN workbench: runtime contracts and source comparisons

Status: `lab-test`. Consumer: native adapter, task/state/proof maintainers and
`$slice-work` after the operator settles a slice. Owner: maintainer. Verified: 2026-09-30.

This is the technical reference linked from the [single product plan](product-architecture.md).
It preserves prior mechanisms, constraints, counterexamples and source identities
while keeping that plan readable. Historical host observations are not freshly
revalidated; proposed contracts do not certify implementation or product uplift.
The existing roadmap/queue owns execution and admission, and
[orchestration](orchestration.md) owns the broader research mechanisms.

## Product contract, not a document count

Given an accepted user outcome, KRN must let a fresh supported coding-agent
session: discover eligible work; claim one task without stealing another worker's
turn; distinguish preserved, legally replaced and revoked obligations against
an authentic user request; read only the missing evidence for its next action;
repair code; prove the changed requirement and regressions at a pinned fixed
point; close only after the checked effect is observed; and recover after an
interrupted session without trusting an obsolete checkpoint. The native agent
with live Goal, repository and task reads is the mandatory control. A green
suite, a model verdict, a retrieval hit, or a neat Markdown page does not
establish this contract or an outcome improvement.

One concrete failure: task B depends on A. After A closes, exactly one worker
claims B. A later user request replaces an old public symbol but preserves
atomicity and isolation. A stale checkpoint still asks for the old symbol.
The next session must read the authoritative request, preserve the behavioral
obligations under an executed mapping, reject an unauthorized revoke, and
refuse close if the evidence belongs to another request revision or commit.
An unrelated change must not force a false block. A worker cannot invent its
own user approval. The checked base/head and merged fixed point remain visible
in the task result. This scenario supplies positive, negative and native arms
for admission and restart; a single laboratory case cannot establish uplift.

## Chosen ownership, types and storage

| Truth | Current owner and selected target | Not its authority |
|---|---|---|
| Current outcome | The accepted operator request, or its native Goal when one exists; only the operator can change acceptance. Codex/Pi Goal state follows the actual host and session branch. | A child process's copied prompt or the task queue. |
| Work item and user-approved task intent | The one operating `refs/krn/queue` snapshot, updated with expected-old Git-ref CAS. Existing `tasks`, `operations` and `intents` stay its owner; add scoped intent events to the task only after host-source validation. | Capsule, lesson, Herdr pane, Markdown mirror or a second DB. |
| Code and executable acceptance | Immutable Git objects, frozen tests and candidate-bound receipts. Commit, task close, review and handoff have different source-of-truth checks. | Agent self-report or reviewer vote. |
| One outcome's restart | `$delivery-loop`'s ignored, bounded checkpoint, derived from Goal/task/code and removed at its cleanup trigger. | Canonical user authority or task status. |
| Reusable procedural knowledge | Gate-backed `workflow-lessons.md`, with trigger, evidence and retirement. | Automatic conversion of task comments or entire transcripts. |
| Shared facts and hard decisions | Git-reviewed `CONTEXT.md`, ADRs and curated topic pages. | Session memory or an unchecked memory extractor. |
| Search | Map, exact/lexical/Git, metadata and explicit links; optional *derived and disposable* FTS5 only after a measured miss survives repair. | Embeddings, a graph or index ranking as source of truth. |

These are conceptual interfaces, **not** a new schema already shipped:

```text
IntentChange: taskId, expectedRevision, source{host, session/message locator,
              content digest, approving actor}, scope[obligationId],
              action[preserve | replace(successor, mappingCheck) | revoke]
DecisionFrame: project/worktree identity, goalId?, goalRevision/source digest?,
               selectorOid, queueOid, taskId, claimEpoch, intentRevision, gitHead,
               sourceRefs[], applicable[], missingEvidence[], nextGate
```

Task, lease and proof shapes remain with the existing task/proof owners and
[ticket protocol](ticket-protocol.md); do not maintain parallel pseudotypes here.
The view consumes their actual generations and candidate-bound evidence.

These fields describe the selected Git-ref profile. A workbench must also honor
an explicit project no-tracker profile: current request/Goal and repository
sources remain its authorities; task/claim/queue fields are not manufactured.
An expected Git-ref selector missing or unreadable is different and still
refuses task work. Resolve that distinction from the actual project contract,
not by treating every absent selector as a new empty project. Any other tracker
needs its own real read/write contract before it can supply equivalent bindings.

Only the task owner writes task intent. The host or operator captures a real
user request and approves its scope; a model may *propose*, never approve,
`replace`/`revoke`. A digest binds bytes but does not authenticate authorship.
If Pi/Codex cannot expose an independently identifiable user event, require an
explicit operator-confirmed task transition; do not infer authority from task
prose, an agent-written capsule or a model classification. A delta preserves
all omitted obligations; complete-snapshot semantics remain unsupported until
a separate qualified source and test exist. `sh-167` presently exercises only
caller-curated fixtures, so this real-user ingress is open work.

`DecisionFrame` is a bounded read view, not another persistent record. Resolve
Goal/current request, one selected queue snapshot, code identity and only sources
required by the next decision. The earlier task/epoch/HEAD cache key is superseded:
it omitted Goal-content and selected-queue changes. Any reused descriptive view
also binds project/worktree, `selectorOid` and queue `oid`, Goal/request revision
or source digest, and relevant declared input digests. The existing
`readActiveTaskStoreSnapshot` exposes both Git OIDs. When the host cannot expose
a trustworthy Goal revision, reread its current request before consequential
actions instead of caching its authority. HEAD alone omits dirty and necessary
ignored/generated inputs; qualify them through the existing input owner.

Even an unchanged key cannot authorize an effect: a lease expires with clock
time, permissions can change, and a digest does not authenticate an approving
actor. The effect owner rechecks current selector/queue, claim/lease/intent,
actual approval and candidate inputs at its own transition, then reads back
the result. These are proposed invariants, not a claim every current effect path
already enforces them. Refuse or refresh an affected stale/unknown view; never
store an old `ready` or approval claim in a capsule as authority. Falsifiers:
change acceptance under the same Goal ID, advance only queue/selector state,
or expire a lease without changing refs; the old view must not admit an action.
A sourced requirement may
remain true after unrelated code changes: evaluate its own applicability,
not a global diff-level stale flag. If the exact source or required evidence
cannot be resolved, return `unknown` and stop the affected transition. Count
all extraction, reading, retry and context tokens before claiming efficiency.

## Design alternatives and bounded recommendation (2026-09-30)

Three independent read-only designs challenged the existing target rather than
assuming a new framework. This is design evidence, not an outcome experiment.

| Alternative | Useful leverage | Strongest counterargument | Disposition |
|---|---|---|---|
| A: reduce to native execution and deep task/state/install owners | removes repeated caller-side sequencing and unearned always-loaded instructions | fewer command names can hide more operator work; deleting a live consumer is not simplification | retain existing ownership and repair its seams first; do not retire aliases, lessons, skills or laboratory tools without consumer evidence |
| B: typed prerequisites and a derived evidence graph | makes action-specific refusals, unknown effects and stale generations explicit | a well-typed graph can still contain forged authority or a self-authored green receipt | retain execution, fencing and readback invariants at effect owners; defer a shared action DSL, persistent graph or new registry |
| C: make the common user's onboarding/work/review/resume path trivial | hides flags and protocol order while exposing scope and actual effects | the native host may already provide this interface; another facade can add no value | lab-test clearer existing command results and exact setup plans before adding commands or interactive machinery |

The recommended direction combines A's subtraction, C's user-facing clarity,
and B's irreducible correctness conditions. It does not supersede ADR 0006's
installed defaults, choose a different task backend, or claim a breakthrough.
The counterexample set includes stale authority, a supplied green record,
crash after effect, two independent clones, cancelled continuation, an unrelated
change, a small typo and a full source review. Each effect owner must still
refuse independently if every explanatory graph or UI is removed.

A normal outcome uses one authorized writer and the recorded PR/review/fix/merge
scope; install and host changes keep separate grants. No per-commit approval
ritual and no automatic expansion of authority are introduced. Reuse existing
knowledge before refreshing its primary source. Instruction delivery, procedure
selection, correct execution and observed effect remain separate observations.
`writing-for-agents` is a pinned authoring aid, not an empirically certified
policy engine; its proposed wording changes must survive the same countercases.
The roadmap owns the slices and their falsifiers, not this comparison table.

## Caller-facing CLI and memory qualification

The installed source-owned front door is `krn`; `krn-codex-catalog` is a thin
compatibility wrapper into its capability command. Other personal binaries
sharing the prefix have another checkout/owner and are not this installer’s
retirement targets. Current installation identity, command existence and
fresh-process loading are separate observations.

| Surface | Current role | Candidate disposition, not an implemented retirement |
|---|---|---|
| task | authoritative work/claim/history/intent and checked effects | retain the deep owner; qualify single-task machine reads and structured generations before adding orchestration |
| state | bounded restart/compile/readback | retain conditional continuation; no cached approval or task-status authority |
| memory / lessons | memory dispatches procedural lesson recall/usage/check/verify/reanchor; lessons aliases the last three | one canonical semantic entrypoint after real caller migration; neither is a second DB or a general search over all repository knowledge |
| repo / skills / capability | local adoption, generated export and explicit capability maintenance | improve exact plans and read-only inspection; keep host/profile writes explicit and developer operations out of the default daily journey |
| changes / gate / conformance | different proof, transition and frozen-acceptance contracts | preserve the distinctions and truthful failure; do not merge them into one green badge |
| install / doctor | host release lifecycle and readable inspection | retain actual operator consumers and rollback; aliases may be retired only after their external callers are qualified |
| harness compare | laboratory/measurement consumer | preserve ADR 0006’s consumer/proof boundary; development-only exposure is a choice to qualify, not immediate deletion |

Observed integrator friction includes whole-task-list extraction for current
owner/epoch/lease, while show/fields expose presentation labels and env serves
lane bindings. The smallest improvement must first account for those existing
interfaces, preserve compatibility, identify a second real caller and keep
read-only effects/unknowns explicit. New wrappers, command names and root
defaults must not hide wrong-repository selection or another permission.

Useful memory means the agent can obtain the evidence needed for its next
question from current authorities and reusable knowledge, not that it calls
recall on every turn. Keep live task history, outcome continuation, reviewed
shared facts and executable procedural lessons distinct. A composed read view
may cite them without becoming their store or granting authority. Measure a
real miss against current/native reading, source applicability, counterevidence
and changed-authority cases before implementing another view or index. Existing
D4/D5/sh-169/sh-185 gates remain; neutral small work must not acquire a mandatory
memory ritual. CLI integration and memory-usefulness decisions are tasks in the
roadmap, and their publication is not evidence of product benefit.

## Workspace and run contract

Persistent working state has one existing shape:
`.krn/runs/<workflow>/<run-id>/`. Candidate, clone, home, operation packet and
logs belong to that run as children, not independently located peer roots.
A writable sandbox clone is not a linked Git worktree; callers must name the
actual mode rather than call both `WT`. Queue coordination follows canonical
Git common-directory identity, while a run belongs to its actual checkout.

| Resource | Owner and lifecycle | Deliberate exception / refusal |
|---|---|---|
| Persistent workflow run | creating workflow and the outcome's sole writer; one named consumer and cleanup/supersession trigger | a transfer does not authorize deleting another owner's run or resurrecting a cancelled outcome |
| Candidate linked worktree | existing kernel/worktree owner, called by the integrator | refusal/failure must report owned cleanup; removing one resource must not prune or delete unrelated author worktrees |
| Isolated writable clone/copy | existing lane/harness owner; source is read-only and the candidate is read back before integration | reject destination-inside-source recursion and source-linked `.git` metadata; exclude unrelated runs and private data |
| Short-lived proof/test fixture | caller-owned temporary scope, removed on success and failure | temporary fixtures are not durable continuation; do not force all test trees into the source checkout |
| Queue lock | task owner under the shared Git common directory | not a workflow run and not a distributed lock |
| Install staging | installer on the release filesystem for atomic rename | do not relocate staging into a generic run or weaken prior-current rollback |

Extend an existing owner only for an actual caller; do not create a universal
workspace service or `.krn/worktrees` registry. Normalize persistent paths,
realpath containment and cleanup outcomes together. Preserve condensed evidence
needed for recovery, but separately minimize credential-bearing home retention.
After an ambiguous external effect, read back the effect before replay or
cleanup that could erase required recovery evidence. These are target contracts;
current shell/harness divergences are repairs in the roadmap, not guarantees
already delivered by this page.

The creative workbench comparison distinguishes session fork, workspace fork,
code checkpoint and project backup. T3's pinned
[CheckpointStore](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/server/src/checkpointing/CheckpointStore.ts)
captures/restores hidden Git refs with an isolated index, but does not coordinate
conversation rollback and may fall back to HEAD. **Adopt** the distinction;
**lab-test** any combined recovery action on dirty/untracked/required ignored
inputs before exposing it. Task export, code/effect refs and native session
history need their own restore readback; ordinary export excludes credentials.
Rollback after new writes must preserve those writes through a qualified reverse
migration or explicitly report it unavailable. A code checkpoint alone is not
that backup. Owner: existing workspace/task/host maintainers; consumer: actual
interrupted-project recovery. Falsifier: a plausible restore loses an obligation,
accepted task write or necessary input. No checkpoint/backup was executed here.

## Runtime and host profile

The supported **local profile** is Node 22 ESM, one writing integrator, the
shared Git common directory for linked worktrees, a short queue-write lock
plus ref CAS, and isolated task branches. There is no distributed consensus
or multi-host write guarantee. Other clones submit candidate commits and
proof to this integrator; they do not compete to write a locally independent
`refs/krn/queue`. Multi-writer remote sync requires a distinct demonstrated
consumer and a storage migration; a Git-ref CAS in two disconnected clones
is not a distributed lock. `sh-180` repairs the observed imported proof-close
gap before dependent `sh-167` can become `done`.

The **agent-host profile** uses the installed Pi-Agent-Goal extension's
branch-local state for current intent, and Codex/OpenCode hook surfaces only
where they actually
load. A future read-only CLI view may compile a decision frame for
`krn task`/`state` consumers; do not install a Pi extension solely to insert
unmeasured prompt text. Pi's first-message project `AGENTS.md` and skill
*descriptions* were observed, not a loaded global Codex contract or Codex
hook. Pi Agent Goal 2026.7.18 declares Pi peers `<0.81` while this host runs
Pi 0.87.1; `get_goal` works, but idle continuation requires its opt-in flag,
version-compatibility and live TUI smoke before any unattended promise.
Codex's non-managed `/hooks` trust requires genuine operator review.

**Model and Herdr topology (historical operator scope, 2026-09-27):** GPT-6 Sol is
the sole writing integrator and direct control. GPT-6 Luna from `openai-codex`
handles bounded read-only questions; GPT-6 Astra is reserved for rare genuinely
complex design or counterexample questions with a stated reason and measured
cost, not routine review. Do not dispatch GPT-5.6 or DeepSeek for new work in
this Goal; their prior runs remain historical evidence with their limits.
A writing worker requires separately verified whole-process isolation, distinct
worktrees, restricted credentials/network, scope and cancellation, and an
integrator-read-back diff; a writer handoff is a separate authorized action.
Dispatch an ephemeral `pi --mode json` child with an
exact model, thinking level, tool allowlist, SHA, deadline and output contract.
Require terminal `message_end`, `agent_settled`, process exit, usage and error
readback; `agent_end` or exit zero alone does not indicate success. Pi's
example subagent extension is **not** a production sandbox: it parses an
undocumented `tool_result_end` instead of `tool_execution_end` and its SIGKILL
fallback does not prove process-tree exit. Start with this one-shot transport;
use RPC/SDK or a project extension only after a second real caller needs
steering or persistent interactive control.

Herdr is the operator's pane and agent-state console. The installed personal
Pi extension reports session identity and `working/blocked/idle` only for
TUI root sessions; JSON children do not acquire task authority from it.
Herdr may host separately identified interactive worker panes and show their
state, but queue claim, Goal, authorization, proof and costs remain with their
canonical owners. The user's existing `pi` wrapper currently fails on an
unrelated malformed mise config; the verified direct Pi 0.87.1 binary runs
read-only workers. No persistent Herdr worker pane or KRN Pi extension is
installed by this research; the temporary Luna pane noted by `sh-186` was
closed. Do not confuse a green pane icon with completed work.

**Current instruction/source qualification (2026-09-30).** The current accepted
request has a Sol 6.1 writing integrator and separately identified read-only
research/review workers. Official [GPT-6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
now distinguishes Sol 6.1 from Sol and lists supported effort settings; a
requested model or tool's default does not establish the actual backend effort.
The current delegation interface exposes model selection but no thinking
parameter, so do not label a worker xhigh without readback. Provider-native
multi-agent/managed-host alternatives, shared tools, compaction, privacy and
access limits are qualified in [orchestration](orchestration.md#current-provider-capabilities-and-local-implications-verified-2026-09-30).
No new host, account tier, writing-worker transport or cloud authority was
adopted. The historical profile above is not an unbounded permission for a new
session; re-read the accepted request and current queue before acting.

## Failure and scale contract

Each row is a condition to exercise, not a claimed guarantee. Test local
behavior first; the remote profile is conditional. Freeze run count, p95/cost
budget and failure classification before an outcome pilot.

| Risk and owner | Current mechanism or selected invariant | Deciding failure test / escalation |
|---|---|---|
| Dependency cycle and deadlock: task | Reject unknown blockers/cycles at write; short queue lock protects a synchronous CAS, never a model call. | Two linked worktrees contend; one claim wins. Opposite-order operations, interrupted lock holder and explicit recovery never silently admit both. |
| Claim race, stale worker: task | Epoch plus lease and expected-old ref; a retry reads state before another effect. | Old worker response after takeover cannot change task or apply code. |
| N+1 reads: task/context | Read one queue snapshot per command; batch source identities before opening selected evidence. | Instrument Git subprocess/read counts on 100 and larger frozen task sets; rising per-task lookups or p95 beyond a preregistered budget reopens a derived index. |
| Memory growth and context rot: Pi/capsule | Bounded model-facing frame and checkpoint; discard raw child JSON after safe accounting and retain no copied corpus in Git. | Long-session soak checks RSS, file descriptors, retained runs, bytes and cost; full workflow outcome, not compression ratio, chooses retention. |
| Credential or cross-task leak: host | Do not pass host home/secrets into workers; sanitize logs before any persistent record; untrusted retrieval is data. | Deliberate sentinel in foreign task/source must not enter worker output, memory write, pane status or published artifact. |
| Local versus distributed lock: task | CAS and worktree-common lock only on one Git common directory. Remote clones are candidate producers, not independent queue leaders. | Two independent clones attempting the same claim demonstrate the missing guarantee; refuse that topology, do not market it as synchronized. |
| Eventual consistency and stale context: delivery-loop | Source revisions, task epoch and HEAD must match on each high-impact decision; the checkpoint is a cache. | Change task authority after checkpoint; stale-consistent action or stale proof admission fails. No automatic background re-sync is assumed. |
| Crash, failover and idempotency: task/host | Read operation/effect refs and claim epoch after crash; ambiguous readback blocks blind retry. An operator designates a successor writer. | Fault injection before/after queue+effect CAS and lost response produces at most one observed result, otherwise remains ambiguous. |
| Provider outage, 429 and cancellation: dispatch | Bounded retries and deadlines with all cost charged; no silent model substitution during a matched evaluation. | 429, aborted child, missing `agent_settled` and an unexited process tree report unavailable, not successful zero-cost work. |
| Load balancing: integrator | No fleet daemon. Schedule bounded independent reads by the actual bottleneck; at most one writing integrator. | Compare accepted repairs per wall-time and billed total against one Sol agent and one ordinary read-only brief; discard fanout without net benefit. |
| Rollback: release/task/memory | Git revert/fix-forward preserves evidence; sealed immutable release and prior `current` remain recoverable; task intent change is a compensating new revision; regenerate derived frame. | Failed install restores prior release, schema downgrade refuses unknown state, restore retains task IDs/claim epochs, and no reopened task erases history. |
| External approval and proof: maintainer | Git/CI checks, human approval and current Goal have separate owners. | Invalid waiver, fake `Task:` trailer, changed merged commit or untrusted approval fails closed; tests cannot sign user intent. |

Cross-machine multi-writer durability, automatic leader election, distributed
locks and a replicated memory service are **not** in the selected product.
If a measured need appears, compare a single remote coordinator with a
versioned transactional backend such as Beads' Dolt design using an explicit
export, dual-read migration, fenced writes, recovery and contract-stage
retirement. Do not gradually turn one local queue into two live stores.

## What external implementations earn here

- Pi 0.87.1 [extensions](https://pi.dev/docs/latest/extensions), [JSON event stream](https://pi.dev/docs/latest/json), [CLI integration](https://pi.dev/docs/latest/cli-integration) and [security](https://pi.dev/docs/latest/security), checked against the installed 0.87.1 files on 2026-09-27: `agent_settled` and finalized `message_end` are stronger completion signals than `agent_end`, while extensions and subprocesses retain their OS privileges. [Pi Agent Goal 2026.7.18](https://github.com/KristjanPikhof/Pi-Agent-Goal) has branch-local state and opt-in continuation but declares peers below 0.81. **Lab-test** this host before any long-running dispatch; don't invent a daemon.
- [Herdr's agent guide](https://herdr.dev/agent-guide.md), its installed `herdr --skill` output and the personal `herdr-agent-state.ts` inspected 2026-09-27: panes and TUI lifecycle are observable; Herdr does not own task, Goal or proof state. **Adopt** it as display/control only and verify each worker's identity and actual checkout before promotion.
- [Mem0 at `94c3fe9`](https://github.com/mem0ai/mem0/tree/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd), [add](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/docs/core-concepts/memory-operations/add.mdx) and [search](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/docs/core-concepts/memory-operations/search.mdx): scoped search and the OSS [`explain` score breakdown](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/docs/core-concepts/memory-operations/search.mdx#explain-oss-search-scores) are useful *lab-test* patterns. Both managed and OSS `add` use additive extraction; OSS also exposes explicit update/delete. Managed benchmark scores reflect proprietary optimizations that OSS users cannot reproduce directly. Neither fact extraction nor embeddings authenticate a revoked coding requirement. **Reject** it as the authority store.
- [Mastra at `edc77fc`](https://github.com/mastra-ai/mastra/tree/edc77fcd6897323d2d69e919148321edf07dfa84), [observational memory](https://github.com/mastra-ai/mastra/blob/edc77fcd6897323d2d69e919148321edf07dfa84/docs/src/content/en/docs/memory/observational-memory.mdx): thread-scoped observations link back to raw message ranges; delayed hints are cleared on activation, and shared resource scope is deprecated. **Lab-test** source pointers if an authentic restart fails; **defer** another background observer/storage owner. Its self-reported compression is not a KRN outcome.
- [Letta Code at `1cab1b7`](https://github.com/letta-ai/letta-code/tree/1cab1b78d413789cf77c852a884aee47eada6007), [conflict repair](https://github.com/letta-ai/letta-code/blob/1cab1b78d413789cf77c852a884aee47eada6007/src/agent/memory-conflict-repair.ts): Git-backed MemFS and a token/owner-bound conflict attempt illustrate safe recovery under actual concurrent memory writers. **Defer** its repair worker while KRN has one capsule writer; reopen on a reproducible lost update, not on feature parity.
- [Graphiti at `6b4b56f`](https://github.com/getzep/graphiti/tree/6b4b56ff6f4b1e4e69c3c3c5487cf1b8762c483a): source-linked temporal validity is a useful *model of the question*. Its episodes, graph database and extraction would duplicate KRN's user/task authority at this size. **Reject** a graph store without a recurring historical-query consumer after the existing link ladder fails.
- [Beads at `54dd4da`](https://github.com/gastownhall/beads/tree/54dd4da6708558840f88863266b9ca702893feb1), [dependencies and gates](https://github.com/gastownhall/beads/blob/54dd4da6708558840f88863266b9ca702893feb1/docs/core-concepts/dependencies.md) and [README schema guard](https://github.com/gastownhall/beads/blob/54dd4da6708558840f88863266b9ca702893feb1/README.md#schema-version-guard): dependency frontier and explicit CI/PR/human gates are candidate contracts for KRN's queue; an older binary refusing a newer schema is a useful migration guard, not a reason to switch to Dolt. Its Dolt server/embedded modes and remote sync solve a different distributed topology; **defer** replacing a local Git-ref backend without measured multi-writer demand.
- [LangGraph at `7daa3ab`](https://github.com/langchain-ai/langgraph/tree/7daa3ab49d678a5da75edb08baa87db4a2be52c3): checkpointed ongoing workflow versus long-term memory reinforces the Goal/capsule/knowledge split. **Reject** importing a second orchestration graph while Pi already owns the agent loop and its installed Goal extension owns branch-local outcome state.
- [AHE](https://arxiv.org/abs/2604.25850), [ACE](https://arxiv.org/abs/2510.04618), [RRSI](https://arxiv.org/abs/2609.24972), [VibeMemBench](https://arxiv.org/abs/2609.23570), [Missing Complement](https://arxiv.org/abs/2609.20050), and [Impact Is Not Invalidation](https://arxiv.org/abs/2609.25130): keep incremental curated knowledge, small falsifiable edits, claim-relative applicability, and complete decision evidence **as tested policies**. VibeMemBench's transfer intervals all cross zero, ordinary memory systems rarely beat memory-off; Missing Complement's controller has real extra online cost. They do not establish KRN uplift. The local before-state repair and qualified sh-167 oracle have executed mechanical proof; agent behavior remains open.
- Operator-supplied screenshots `IMG_8412`–`IMG_8419` (practitioner anecdotes, 2026-09-27): use small task-specific reference briefs, focused specialist advice, an independent UX/error-state question for UI work, and cheap deterministic tests before advisory review. Reject per-model-interaction `__log__` dumps, default LLM-judge approval and a broad self-improvement scheduler. The reported `/state` endpoint with many database calls is an **N+1 test candidate**, not evidence of a KRN query defect. Product delivery, bounded context and full cost outrank agent gymnastics. Do not copy the screenshots or their passages into Git.

## Native workbench evidence and interface qualifications

The [single operator plan](product-architecture.md) owns product direction and alternatives.
This reference retains current-owner contracts and their source-specific limits.
The current C/Git-ref design remains the operating baseline; the operator authorized
exploring alternatives, including retiring stores/continuation machinery, without
adopting or deploying them. Native loading, intent ingress, migration and effect
proof remain qualification gates.

### What the supplied source actually says

Peter Steinberger's [2026-09-22 reply](https://x.com/steipete/status/2102516479900229976)
was verified against X's official syndication response, including its parent ID.
He favors web over the [parent's many-agent editor setup](https://x.com/hraness/status/2102501684169634220).
The parent advertises a large daily token budget; that is its author's claim,
not measured productivity. The operator additionally supplied a clarification
about a web interface managing sessions. That excerpt's separate post identity
was not verified. Neither excerpt specifies a memory system or proves a quality
gain. The KRN implication is a browser client for real sessions and projects.
Theo/T3 is assessed through the first-party project linked from
[Theo's own site](https://t3.gg/), its code and authoring rules; personal video
positions were not inspected or inferred from third-party commentary.

| Primary source, checked 2026-09-30 | Mechanism and local disposition | Limit / observation that could reverse it |
|---|---|---|
| Peter, [Shipping at Inference-Speed](https://steipete.me/posts/2025/shipping-at-inference-speed), 2025-12-28, and [Just Talk To It](https://steipete.me/posts/just-talk-to-it), 2025-10-14 | Start with an executable CLI and close the feedback loop; maintain subsystem knowledge in the repository; choose dependencies and data flow carefully; iterate on the actual product. **Adopt** these as design criteria, owned by the maintainer. | Personal practice is not a controlled result. His historical model comparisons and solo main-branch workflow do not replace KRN's current model or publication policy. Reopen a particular criterion when a real caller demonstrably pays more for it than the native alternative. |
| T3 Code [architecture](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/docs/internals/overview.md) and [authoring rules](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/AGENTS.md), pin `c2fa9fc` | The environment server owns execution, credentials and Git; browser UI consumes typed commands/events. Accepted intent, agent completion and checkpoint settlement differ. **Adopt** those separations for the proposed panel; **defer** copying its DB/event engine. | This is an architectural precedent, not KRN proof. A reconnect showing an accepted command as a completed task, or two clients disagreeing about the current result, falsifies the panel design. The existing task store remains authoritative. |
| Official [Codex App Server](https://learn.chatgpt.com/docs/app-server), verified 2026-09-30 | Native thread/turn control, streamed events, version-specific schemas, request-scoped approvals and remote TUI are documented. **Lab-test** a local stdio bridge; distinguish new session, stored-history resume and live-process attach. [SDK](https://learn.chatgpt.com/docs/codex-sdk) is the simpler automation candidate, not an assumed replacement for the panel's interactive requirements. | App-server and WebSocket remain documented as experimental/unsupported for production. A saved thread can resume without proving attachment to another active TUI/desktop process. Installed compatibility and shared-controller behavior remain unobserved. |
| Pi [execution](https://pi.dev/docs/latest/how-pi-works), [sessions](https://pi.dev/docs/latest/session-format), [RPC](https://pi.dev/docs/latest/rpc) and [security](https://pi.dev/docs/latest/security), latest docs verified 2026-09-30 | Native session/context mechanisms remain the owner. **Lab-test** the exported TypeScript `RpcClient` before writing a protocol client; accepted prompt and low-level run end are distinct from settled execution. | Docs describe cancellation; the gap is installed-host observation, queued-work semantics and process-tree termination. Extensions retain process privileges. A history cursor does not establish complete replay of transient events or a permission grant. |
| Official [Codex memories](https://learn.chatgpt.com/docs/customization/memories), verified 2026-09-30 | Local generated memories are optional recall from prior work; mandatory team rules belong in repository instructions/docs. **Lab-test** native recall before earning any KRN extractor; **reject** memory as task or approval authority. | Documentation does not show the feature enabled here, does not share that store with Pi, and does not establish outcome improvement. A stale memory overriding live intent falsifies an adapter's use of it. |
| OpenClaw [memory architecture](https://github.com/openclaw/openclaw/blob/96af591f74c374532274d735c6b0ba8bd1a59d59/docs/concepts/memory-architecture.md) and [builtin memory](https://github.com/openclaw/openclaw/blob/96af591f74c374532274d735c6b0ba8bd1a59d59/docs/concepts/memory-builtin.md), pin `96af591` | Separate memory tiers and provenance; recalled text must not re-promote itself; one consolidation writer preserves source anchors and supersession. Markdown facts and derived search indexes have different owners. **Adopt** these review questions; **defer** an extractor, dreamer or index. | Declared origin metadata is not authenticated user authority; workspace edits are trusted and network taint depends on tools. Bootstrap descriptions differ across docs, so exact injection is unqualified. Its memory DB also contains session data: rebuilding indexes does not justify deleting that DB. |

These sources point toward native execution with visible product feedback,
small typed control surfaces and distinct memory responsibilities. That is a
bounded synthesis, not a forecast that all harnesses converge or that KRN is
the best implementation. The strongest simpler competitor is the native client
with project instructions, current tasks and direct repository reading.

### One complete user journey

The initial target is one local operator, one explicitly selected repository,
one writing integrator, and official OpenAI models through Codex or Pi. Other
project panes can be visible without acquiring write authority. Broader provider,
remote-team and autonomous-worker support require their own consumer and gates.

1. **Connect a project.** Inspect its real Git root, existing instructions,
   package/runtime commands, task selection and dirty work. Show the exact setup
   effects and the reason for each. Reuse the project's standards; propose only
   missing local facts and controls. A successful file write is distinct from a
   fresh native session actually loading it.
2. **Clarify and plan an outcome.** Keep the operator's objective, constraints
   and observable result. Use the owner for the current uncertainty; ready work
   gets small vertical tasks with dependencies and an acceptance check. Ask only
   when missing information changes authority, acceptance or destination;
   otherwise state a reversible assumption and continue. Research
   and unresolved design stay explicitly unsettled. Small edits retain a short
   path; a plan does not force every task through every skill.
3. **Choose legal work and supply context.** Read the selected queue and current
   task generation. Show why work is blocked. A task-specific view cites the
   current outcome, acceptance, applicable standards, code locations, source
   revisions and missing evidence. Reuse current task/state views first; D5
   still controls whether a new context compiler earns implementation.
4. **Execute in the native host.** Bind the selected repository, task, claim
   epoch and native session. Send the bounded request through the host's official
   control interface. The native host owns the model/tool loop, conversation,
   authentication and host approvals. KRN owns project/task correctness.
5. **Verify and integrate.** Show the actual diff, fastest disagreeing check,
   applicable repository gates and required review. Accepted command, successful
   turn, tested candidate and observed merge remain separate states. Publication
   uses existing authority; task close requires the task owner's readback.
6. **Resume or change direction.** After reconnect, compaction, restart or a new
   user constraint, reread live owners before the next consequential action.
   Preserve unfinished obligations; replace or revoke them only through their
   authorized owner. Keep a bounded continuation when needed, and promote only
   reusable knowledge with its consumer and supersession rule.

For example, plan a project's export feature, find its existing validation and
file-writing convention, claim the next legal task, implement via Codex, verify
the exported artifact, interrupt the session, and resume with the current task
and unchanged acceptance. A later operator change to the export format must
invalidate relevant old acceptance without losing retained atomicity obligations.
The panel must also support diagnosing an existing regression, a bounded
migration, and switching projects without leaking their context or permissions.

### Code and product surfaces

Keep the existing task, state, knowledge, proof, workspace and installer owners.
The credible new code is a narrow native-host adapter, a local browser bridge
and the web UI. They are roles, not an instruction to create seven packages or
an orchestration framework. CLI and panel must call the same effect owners;
the browser cannot implement a second status machine or write queue refs.
Current `runTaskCommand`/`runStateCommand` use process-global output/exit state,
and `kernel/proc` uses synchronous child calls; these CLI entrypoints are not
already a concurrent server interface. **Lab-test** an asynchronous bridge to
the existing executable with argument arrays, bounded output and explicit
process failure. Do not import CLI dispatchers into simultaneous browser handlers.
Only a real second caller and measured cost earn a transport-neutral library
interface. No subprocess wrapper or service was implemented in this research.

```mermaid
flowchart LR
  Operator[Operator: outcome and authority] --> Clients[CLI or web panel]
  Clients <--> Local[Local bridge: validate scope and commands]
  Local <--> Owners[Existing KRN task, state and proof owners]
  Local <--> Hosts[Native adapters: Codex or Pi]
  Hosts --> Providers[Official model provider]
  Owners --> Sources[Git queue, code and curated knowledge]
```

The host adapter exposes capabilities for session discovery, stored resume,
managed-session control, approvals/questions, progress and usage, rather than
pretending both hosts share one guarantee. Keep native session/host-instance
generation, active-branch identity when available, pending request IDs and
option IDs. Distinguish blocking questions from asynchronous user-input requests.
Unsupported/native-only operations remain explicit. The initial control slice
owns a session it starts; attaching any existing TUI/desktop session is separately
unqualified. Several panes may observe, while one named controller steers.
Do not emulate these contracts by parsing terminal appearance.
Keep upstream protocol types at that adapter and validate external events once.
Provider history remains with the provider host; any KRN session/task association
has one run owner and lifecycle, rather than another transcript or memory store.

The bridge starts locally, serves UI/control through one origin, validates
origin/host/session and the command scope, and keeps credentials outside the
browser. Loopback reachability alone is not authorization. It scopes each
command to the selected repository/session/current task. Browser authentication
and per-command authority are different checks. Reconnect loses live/control
confidence until protocol-specific native readback and current KRN state agree.
No shared atomic snapshot/event cursor was established for both hosts. A history
cursor recovers history, not every transient event. Correlation IDs do not prove
deduplication: a lost response to start/prompt must not trigger blind effect
replay. Cancellation and a lost response expose unknown effect until its owner
inspects it. A stale UI cannot
approve a newer request merely because its button retained the same position.
Remote access is a separate product/security slice, not the default panel host.

The first read-only panel has project/session navigation; the task frontier and
reasons for refusal; current diff/check readback; and context/source inspection.
Live conversation, approval inbox and start/steer/stop belong to the later control
slice. The full target also includes product
preview where available; proof/publication readback; and a context inspector
showing included sources, scope and stale/missing evidence. Model/effort, usage
availability and complete cost are visible. These are views over owners. A pane
turning green does not close a task, and arbitrary shell execution is not the
panel's generic command interface. Build a polished single-project work screen
before a fleet dashboard or an IDE clone. Use the workflow prototype to test
layout against a real interrupted task before building the complete UI.

Compare three actual delivery choices before authoring that client: the native
UI plus current CLI, an existing web panel with a supported KRN integration, and
a small owned client. Prefer the existing panel if its real extension seam can
serve both hosts and KRN operations without a long-lived fork or duplicated task
truth. At T3 pin `c2fa9fc`, [ProviderDriver](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/server/src/provider/ProviderDriver.ts),
[ProviderAdapter](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/server/src/provider/Services/ProviderAdapter.ts)
and its [injected registry](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts)
are real source-level extension seams. A public drop-in KRN/Pi loader and existing
Pi integration were not established. [MIT permission](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/LICENSE)
does not remove fork/upstream-schema and upgrade cost. KRN tasks and T3 sessions
can remain separate authorities if their mapping creates no competing task state.
No integration was executed in this pass. The small owned client is
the candidate when a reusable seam is absent; copying an entire competing harness
does not minimize its maintenance. A working supported integration reverses that
choice before new UI code is written.

T3's [RPC contract](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/packages/contracts/src/rpc.ts)
has typed authorization errors and separate shell/thread subscriptions. This
supports scoping data/events to the actual observer, not a public KRN plugin API
or a guarantee of future-version compatibility. **Lab-test** the integrated/T3
alternative against the companion route with one real Codex journey, then Pi,
including patch/upgrade/recovery cost. If selected, one core would replace the
old writable task/continuation owner through lossless export, comparison and a
single cutover writer; it must not sit above a second active task engine. This
is an authorized design comparison, not a backend decision or migration grant.

### Native control and recovery qualification

This is a proposed adapter checklist consumed only when that adapter is built,
not a new workflow or installed promise. Pin the real host/schema version first.

| Failure / control | Required distinction and later falsifier |
|---|---|
| Start versus attach | Show whether the panel created a process, resumed saved history or joined a qualified existing process. A second unintended session fails the journey. |
| Accepted versus completed | Pi [RPC](https://pi.dev/docs/latest/rpc) accepts/queues/handles prompts; a handled prompt may start no run, and `agent_end` may precede automatic continuation. Use the maintained client and the appropriate settled result; a quick completion/retry cannot become false `done`. |
| Stop versus queued work | Pi [commands](https://pi.dev/docs/latest/rpc-commands) distinguish abort from clearing queued input before abort; session switching may succeed with `cancelled:true`. Test active cancellation plus queued follow-up. Task lease, task deferral and process interruption are separate owner transitions. |
| Lost ACK or reconnect | Inspect current host generation, pending native request and task state before retrying. A request ID is correlation, not an exactly-once effect receipt. Duplicate prompt/effect or a wrong-project view fails. |
| Approval/question recovery | Preserve native request and option identities beyond the visible/paginated transcript, as required by [T3 provider constraints](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/docs/internals/providers.md). An old question must neither disappear silently nor approve a newer operation. |
| Process/backpressure | Continuously consume native output; bounded buffering, startup/EOF/stderr/timeout/overflow/exit states must be explicit. Browser disconnect need not stop a session. Idle or interruption does not prove rollback of prior effects or exit of descendant processes. |

Owner: native adapter maintainer; consumer: the actual managed-session journey.
**Lab-test** each host's documented capabilities at its authorized fixed point;
**defer** in-process Pi embedding while subprocess RPC supplies the needed seam.
The [Pi SDK](https://pi.dev/docs/latest/sdk) owns runtime replacement/disposal and
finalized context; any future embedding must preserve its subscriptions and
lifecycle. A process boundary is not an OS sandbox. No host probe, provider call,
new cancellation test, remote deployment or writing-worker grant occurred here.

### Memory and context rot as separate failure modes

Use the existing memory planes above. Native session history answers what was
said; Goal/task/authority answer what currently applies; repository knowledge
answers what is reusable; the outcome capsule answers where one outcome resumes.
This contract is owned by `config/AGENTS.md`, `CONTEXT.md` and the existing topic,
not by personal assistant memory, a transcript archive or this design section.
Native generated recall may provide a clue, never replace a mandatory rule.

The view must distinguish relevance to this action, authentic source authority,
current applicability, the named evidence needed for the next gate, and observed
success. `applicable[]` binds a requirement to source/scope/revision;
`missingEvidence[]` names the absent complement or unresolved contradiction and
its source owner. Missing evidence stops that dependent transition while useful
independent reads can continue. An arbitrary project rarely has a mechanically
enumerable complete evidence set: expose `unknown`, rather than certify
understanding from a model's summary. The [deeper source qualification](orchestration.md#action-applicability-and-scoped-memory-workbench-deepening-2026-09-30)
owns the relevance/sufficiency/correctness and poisoning counterexamples.

| Failure | Smallest candidate intervention | Countercase for the real journey |
|---|---|---|
| Relevant fact was never found | Repair the knowledge-map pointer, name, explicit task reference or lexical lookup before indexing. | Needed evidence still cannot be reached; an irrelevant high-ranked hit is insufficient. |
| Fact was found but lost during compaction | Reread the bounded current task/constraints at the next consequential action; retain pointers to supporting details. | Fresh continuation drops a retained requirement or repeats a delivered change. |
| Recalled fact became stale | Check its current owner/revision and explicit supersession before using it. | Old intent wins after a legitimate change, or an unrelated change blocks valid work. |
| Too much competing context | Supply only currently applicable rules and task evidence; disclose deeper material on demand. | Smaller context omits the complementary evidence required for the actual decision. |
| Untrusted text appears authoritative | Keep source origin and permissions separate; only the real effect/intent owner grants authority. | A retrieved instruction, forged approval or foreign-project text changes an authorized operation. |

These controls address concrete errors. They do not eliminate model fallibility,
prove a universal context threshold, or establish memory uplift. The existing
agent-facing mandatory recall was retired; this proposal does not restore it.
D4/sh-169 and H9 own usefulness experiments. FTS remains a disposable candidate
only after a repeatable miss survives current-rung repair; no new vector/graph
store, automatic transcript promotion or universal fresh-session ritual is earned.

Cross-project learning transfers procedure, not another project's naming values,
paths, private data or approvals. Look up recipient-project facts at their current
owner. Promote reviewed project conclusions into existing knowledge; promote
recurring process failures through the existing lesson/falsifier/retirement owner.
Global procedure additionally needs a recipient-project countercase. Do not
automatically turn every successful trajectory into a skill or synchronize native
generated memory into another host. At the active knowledge budget, supersede or
consolidate through the owner before admitting new material; low usage alone
cannot retire a required rule. Retired content leaves active delivery while Git
retains history. Native session retention is separately owned: compaction does
not prove that raw storage or secrets were deleted.

### Stack, standards and subtraction

Choose **TypeScript for new product control code and a React/Vite web client**,
with Node ESM matching the repository's pinned supported runtime. The local
runtime is currently `.mjs`; a whole-repository language rewrite is deferred.
This is a local interactive client, with no demonstrated SSR/RSC consumer.
[React's build-tool guidance](https://react.dev/learn/build-a-react-app-from-scratch)
includes Vite but warns that routing/data needs can grow into a custom framework;
[Vite](https://vite.dev/guide/) supplies development/build tooling, not project
logic. Reuse a supported router/data library when the real screen needs it;
reconsider the framework if the product gains server-rendered requirements.
Migrate one real public seam at a time only when the types remove a demonstrated
class of ambiguity and install/runtime closure remains proven. Retain Python or
shell at existing external seams where replacement has no consumer benefit.
Go/Rust become candidates only for a measured deployment or performance need.
For an existing JS seam, [allowJs](https://www.typescriptlang.org/tsconfig/allowJs.html)
and [checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html) offer a gradual
alternative with JSDoc when it removes the actual ambiguity. This repository
has no TS compiler/formatter/linter script established by this pass; select and
pin only the tooling required by a settled slice, without host/toolchain changes.

The [TypeScript companion](../../skills/engineering/typescript-engineering/SKILL.md)
owns compiler and boundary details. The candidate uses `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, inferred internals,
explicit public contracts, discriminated states and exhaustive dispatch.
External JSON stays `unknown` until one ingress validates shape and semantics.
Types do not validate a queue, authorize an action or prove runtime behavior.
Match NodeNext to the actual build/runtime; native type stripping does not read
tsconfig or typecheck, so it cannot replace compiler proof. Pin a compatible
compiler/build path before migration. Sources: [TSConfig](https://www.typescriptlang.org/tsconfig/)
and [Node type stripping](https://r2.nodejs.org/docs/latest-jod/api/typescript.html)
(the fetched mirror identifies v22.23.2, not the installed v22.23.3).

Use `snake_case` consistently in newly owned internal functions, variables,
fields and file stems if this operator convention is accepted for implementation;
use PascalCase for TS types and React components. Preserve native protocol names,
stable external fields, installed skill IDs and retained historical schemas.
Mapping happens at the adapter, not by renaming provider data or bulk-editing
the existing repository. Naming is a local convention, not a quality result.

Put machine-checkable standards in existing formatter/linter/compiler or public
behavior checks. Instructions carry applicability, reasons and architectural
choices the tools cannot infer. Prefer deep modules, a few domain operations,
plain data and standard libraries. Reuse one validator/implementation instead
of parallel types, schemas and rules maintained by hand. A schema dependency
earns its place when multiple real ingress consumers need it; no DSL, plugin
framework, generic repository abstraction or state-manager stack by default.

Delete a wrapper when deleting it removes complexity without spreading an
invariant to callers. Retire a test only after its actual requirement, keeper
and distinct failure mode are accounted for. The global `0/1/N` proof budget
and local required gate continue to apply: zero new tests for docs/mechanical
work, one focused public-seam falsifier per changed runtime contract, more only
for distinct requirements/failures. New falsifiers first fail on the observed
before-state. Static markup snapshots, callback mirrors and another test of the
same obligation do not earn maintenance. Code beauty is locality, readable data
flow and few caller obligations; raw line count alone is not acceptance.

### Skills and Polish-facing work

Keep one workflow owner for the current uncertainty, with a companion only for
the live technical slice. A reproduced bug routes to diagnosis; a source question
to research and a needed decision to source-to-decision; settled implementation
honors the owner's invocation mode; a fixed candidate routes to the existing
Standards/Spec review. TypeScript is a companion only for an actual typed seam,
and `make-it-sexy` discharges the scoped quality bar. This is conditional routing,
not a mandatory chain and not a replacement skill catalog or procedural fork.

Descriptions should say which distinct situation admits the skill, its result
and the neighboring owner to which it returns. Keep full procedure and branched
references on demand. “Very precise” means unambiguous selection, not every
instruction in every always-loaded description. For a Polish-facing explanation:
“Diagnozuje konkretny błąd lub regresję i wskazuje sprawdzoną przyczynę;
implementację przekazuje właściwemu właścicielowi.” This is illustrative UI prose,
not a new installed skill description. The pinned upstream authoring aid is not
experimental proof of wording, length or language superiority.

**Lab-test** Polish instructions/descriptions against the existing canonical
language on the same real cases, including ambiguous and neighboring triggers,
wrong-project and stale-authority cases. Measure selection, correct execution,
outcome and complete cost separately. Maintain one authored canonical procedure;
do not create an EN/PL pair of live procedural truth or hand-edit upstream owners.
Keep protocol IDs stable while the operator UI and conversation can be Polish.
A from-scratch harness is deferred: replace one proven weak interface only after
a native comparison, with a named migrator and rollback. No current observation
authorizes replacing the adopted architecture.

### Performance and delegation

The [parallelism/context source qualification](orchestration.md#parallel-work-and-context-cost-workbench-qualification-2026-09-30)
owns the paper mechanisms and their limits. Start with batched independent reads
and qualify a task-owner read result carrying selector/queue OIDs, selected-task
generation, compact frontier/blockers, source time and unknown/error state.
Current task dispatch plus its reader can load the queue repeatedly; inspection
of list/show/check/next call paths establishes that shape, not a latency defect.
One snapshot per read result is a target, not shipped behavior. Preserve state
resume's deliberate live readback. Do not bolt separate Git reads onto current
CLI output and call it an atomic snapshot. Existing task-owner interfaces and
H8 own any improvement; descriptive caching never substitutes for effect checks.
Never hold a queue lock across model work. Measure actual
Git subprocesses, cold-start/resume latency and retained resources before adding
an index, persistent worker or daemon. Native host/provider caches retain their
own semantics; an old result cannot become current merely because it was cached.

Use a separate agent for a bounded independent research/review question only
when a separate context or parallel read can repay dispatch and integration.
Give it fixed sources, a question, tool scope, deadline and evidence contract;
the integrator checks the answer against sources. Keep dependency-sensitive
implementation, authorization and shared effects sequential. Current work has
one active implementation item and read-only parallelism. Isolated writing
workers require legal admission and separately qualified isolation; panel tabs
do not earn that authority. Compare accepted outcome latency and full cost,
including retries and corrections, before changing concurrency or model choice.

Current `claimReady` picks the lexicographically first eligible ready task whose
dependencies are done, with CAS; it is not a priority or global-WIP scheduler.
Current single-integrator/WIP policy remains external to that selection. Stopping
a session does not release/park its task; expired leases need the task owner's
explicit transition. Legacy execution hints currently accept codex/opencode, not
Pi; they cannot be silently reinterpreted as host selection or write permission.
An operator-selected Pi session and any later automated Pi routing are distinct
interfaces requiring their existing owner, compatibility and migration contract.

### Qualification and complete cost

The [single operator plan](product-architecture.md) owns the proposed product sequence.
The [roadmap](self-hardening-roadmap.md#current-target-delivery-graph) and live queue
retain execution/admission; this reference is not a second plan or status table.

The plan's second pilot candidate is `bloom-barista-www`. The observation-only
read on 2026-09-30 bound HEAD `a90342c0a5c7fd87ce1f072244e7fa602546745a`, main
ahead of its recorded upstream and seven pre-existing changed paths, to root
AGENTS/README/package metadata (CONTEXT absent). Its contract declares no durable
tracker, local PHP/WordPress/CSS rules, project-specific checks, preserved WIP
and separate deployment/credential authority. Before/after HEAD and path status
matched; metadata digest was
`62ab096e89157a9d166f278ca9bb2465e25fd3951f87720c63c12a0ad398efc8`.
No target files, refs, tasks, tests, host, credentials or remote were changed or
invoked. This proves the bounded metadata observation, not whole-checkout
immutability, runtime correctness, loaded KRN or task authority. Revalidate
identity/instructions and settle prior-work ownership before any authorized
pilot. Never impose a Git-ref queue or emulate claims on its no-tracker profile.

Measure accepted project outcomes and first-pass acceptance, retained-requirement
errors, operator corrections/false blocks, setup/resume burden, latency and all
model/tool/review/retry cost. Compare the native client against KRN under the
same project, model, authority and independently frozen acceptance. A workflow
screen qualifies the route; a repeated, paired real-project comparison is needed
to claim improvement. Faster tokens, more tasks, attractive screens and a green
suite cannot substitute for that result. Stop or reduce a layer when its real
maintenance and operating cost outweigh its observed contribution.

The smallest interruption screen reuses sh-169/sh-167's owners: a genuine task
and agent-authored checkpoint, an independently identifiable post-checkpoint
requirement change, retained-behavior/authority countercases and an unrelated
edit. Match source/tool access and count checkpoint creation, acquisition,
compaction, failed attempts, rereads and operator corrections. The
[protocol qualification](orchestration.md#action-applicability-and-scoped-memory-workbench-deepening-2026-09-30)
does not replace those tasks' acceptance or create another benchmark. If native
reading succeeds more cheaply, reject the proposed extra context-delivery layer.

The decisions in this reference return to the operator/maintainer as `lab-test`
for the workbench, native adapters and Polish treatment; design criteria marked
`adopt` govern this proposal only. New runtime, store, language migration,
host loading and product uplift remain unobserved. Supersede this section in
place when the operator settles product scope or a real journey changes one of
its stated comparisons; retain source-specific limits and move any delivery
decision to its existing roadmap/queue owner.

## Delivery contract and terminal decision

The exact staged implementation, instrument and experiment DAG has one owner:
[self-hardening-roadmap.md](self-hardening-roadmap.md#current-target-delivery-graph).
The Git-ref queue alone owns published task status and claim state; this page
owns *target interfaces and invariants*, not a second priority list. The accepted
request, represented by a native Goal when present, remains the outcome authority. A settled capability can become one vertical
implementation task; a behavioral uncertainty becomes an explicitly bounded
experiment. Do not publish a conditional runtime mechanism as ready work.

Complete the operating task/close and host readback before an authority-changing
memory pilot. Only an actual native-control failure earns the proposed
`DecisionFrame` runtime; a successful native run rejects that extra surface.
After a valid instrument, measure transfer, real catches, false blocks and
complete workflow cost before claiming uplift. Hygiene follows the terminal
product decision, not a green CI alone. If the pilot finds no informative
failure or a weaker/costlier treatment, retain only the earned task/commit
correctness owners and explicitly report that this Goal has **not** established
a breakthrough. The operator may then revise its objective; no benchmark result
or model vote can silently rewrite it.

This page is superseded only by an operator-reviewed end-state design with a
named migrator, or by a recorded counterexample that changes a selected
invariant. Raw corpora, prompt logs, model opinions and user screenshots never
become canonical artifacts.
