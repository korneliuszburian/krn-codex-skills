# KRN product architecture: live decisions across coding work

Status: `lab-test`. Consumer: the active Goal integrator, `$delivery-loop`, and
`$slice-work` after the decision gates settle.
Owner: maintainer. Verified: 2026-09-30.
The 2026-09-30 refresh compares design alternatives and workspace contracts;
historical host observations below are not newly revalidated.
This is the selected target topology and its testable contracts,
not a claim that the product already improves agent outcomes. The current
mechanisms and source comparisons remain in [orchestration.md](orchestration.md);
[self-hardening-roadmap.md](self-hardening-roadmap.md) owns the historical
research edges and current staged delivery graph, this page owns target runtime
contracts, and the Git-ref queue owns published task states. This page is neither a second
tracker nor a replacement for the current host's accepted Goal.

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
Task: id, dependsOn[], status, claim{owner, epoch, lease},
      intentRevision, obligationIds[], acceptanceRefs[], result?
IntentChange: taskId, expectedRevision, source{host, session/message locator,
              content digest, approving actor}, scope[obligationId],
              action[preserve | replace(successor, mappingCheck) | revoke]
DecisionFrame: goalId, taskId, claimEpoch, intentRevision, gitHead,
               sourceRefs[], applicable[], missingEvidence[], nextGate
ProofReceipt: taskId, intentRevision, baseSha, authoredSha, mergedSha,
              checkRef, executedBase, executedHead, verifierIdentity
```

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
Goal, one queue snapshot, HEAD and only source identities required by the next
decision. Key it by `(goalId, taskId, claimEpoch, intentRevision, HEAD,
source digests)`; discard and re-resolve on a changed key. Never store an old
`ready` or approval claim in a capsule as authority. A sourced requirement may
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
