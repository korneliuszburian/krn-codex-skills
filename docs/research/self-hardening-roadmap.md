# Self-hardening research and delivery roadmap

Status: `accepted`. Consumer: the maintainer resuming self-hardening.
Owner: maintainer. Verified: 2026-09-27.

This page owns the bounded plan and its decision dependencies. The configured
Git-ref queue owns task status and claims; [orchestration.md](orchestration.md)
owns research mechanisms, [product-architecture.md](product-architecture.md)
owns target interfaces and invariants, [capabilities](../capabilities.md)
owns capability policy, and the outcome capsule owns current operational
state. This is not a second queue or a claim that a planned mechanism works.
Historical phases below retain their dated evidence; the
[current target delivery graph](#current-target-delivery-graph) supersedes their
old sequencing, not the result of a completed task.

## Historical 2026-09-23 decision and execution boundary

The user resumed local stabilization on 2026-09-23 and explicitly requested
read-only Luna workers. sh-171 repaired PreCompact's event output contract;
sh-172's bounded restore guard is integrated. The sh-166/sh-173 capability and
CLI repairs passed the full gate at `61b9366`, were sealed and installed at
`10fd088`, and received fresh Codex SessionStart, OpenCode configuration and
installed CLI readback. The user authorized local commits, integration and
installation; push, PR and benchmarks remain outside this operation. The
capability owner records availability, while
prompts and source snapshots remain outside Git under the research curation
contract.

## Historical product completion order: sh-174, then sh-175

The 2026-09-23 operator priority is sequential: finish the memory product
before selecting or cutting over the replacement task store. These are two
queued product phases, sh-174 then sh-175, under the current self-hardening
outcome; a ticket does not automatically create another outcome capsule.
sh-170's repository coverage remains
historical input, not a combined implementation ticket. Existing sh-165/sh-167
through sh-169 research gates retain their own authority but do not turn this
product sequence into parallel runtime work.

| Phase | Question and current baseline | Exit condition before the next phase |
|---|---|---|
| sh-174: memory | Separate outcome continuation, durable shared knowledge and reusable workflow lessons from task history. Native Goal plus live repository/tracker reading and the current KRN surfaces are baselines. A disposable clone at `c20e928` showed that a ticket can change `ready → deferred` while `state check` stays clean and SessionStart repeats stale capsule advice; this is structural evidence, not agent behavior. At source `109193e`, lessons has 25 rows, 20 active and four active triggers; one triggered row has no `Recall:` binding. | Map every writer, reader, invalidation and retirement path; classify active lessons as retain, simplify or retire; observe at least two real work/authority transitions within one session, then a fresh continuation, including stale or revoked state and full context cost. Decide the smallest memory contract and whether task links need any resolver. Do not assume the current lessons table is permanent. |
| sh-175: task product | The present Markdown queue requires lane fields for human work, splits claim across ticket and lock, and lives per checkout. Beads supplies the operator-flow benchmark; current files repaired for a shared common dir, SQLite and Git-ref CAS are design countercandidates. | After sh-174 fixes the memory boundary, prove `add → ready → claim → comment → close → history`, human close without a claim, one winner across linked worktrees, crash/retry and lossless import. Choose one canonical backend, switch all readers and writers together, then retire old live files and locks. Do not build a second memory owner. |

The invariant across both phases is one owner for each kind of truth: Goal and
capsule for current outcome, task tracker for work state, Git/checks for code
proof, and a named knowledge owner for reusable claims. A task may reference
knowledge with provenance; it does not automatically turn its comments into
lessons. The task schema must not hard-code today's lesson-row layout before
sh-174's decision. No new ADR or backend is earned by this plan alone.

The decisive correction is that LT-107 does not identify forgetting: its hidden
checks import a renamed symbol. Requirement applicability, evidence freshness,
test feedback and successful repair need separate observations. The bounded
screen in orchestration decides whether the larger comparison is justified.

The ten received Deep Research reports were checked against local source and
selected primary publications on 2026-09-23. They do not establish a new KRN
pass-rate gain or justify another store, graph, selector or proof framework.
Their usable results are narrower: correct the evaluator-integrity boundary to
sh-144, qualify retirement authority before calling a regression forgetting,
compare binding with identical ordinary regression feedback, and repair
observed installed/host seams through their existing owners. Report text is
transient input outside Git; the decisions below supersede its proposals when
local evidence disagrees.
The DR10 synthesis agrees that no new architecture is earned, but its proposed
sh163–sh170 amendments used the wrong local ticket mapping because that report
could not read the local queue or reports 01–09. They are rejected; the ticket
dependencies below remain authoritative. Its categorical memory-delivery
"deletion win" is also too strong: the old trials measured overhead and led to
retirement, but pre-sh-144 evaluator exposure leaves marginal behavioral value
unresolved. Retirement stays in force without a causal zero-benefit claim.

No new ADR is earned. These are repairs within the existing ownership contract
and unpromoted experiments. Reopen ADR 0001/0006 only if measured results require
a different permanent ownership, memory or installed-default boundary.

## Decision return from the ten reports

This table returns dispositions to the existing writer; it is a plan for
deciding checks, not a claim that designed experiments ran. Source mechanisms
and limits live with their topic owners in orchestration, lab-tests and
capabilities; the raw reports remain outside Git.

| Input | Disposition and owner | Deciding falsifier or limit |
|---|---|---|
| DR01 | `lab-test` at sh-169 for agent-authored capsule writing; no new memory fields | one real handoff, independent current-intent/authority score against transcript and repository/native continuation; ABI pass alone fails |
| DR02 | `defer` behavioral ROI; retain lesson rows and `changes check` consumer, keep prompt delivery retired | post-sh-144 matched lesson-present/absent/stale use with true eligible opportunities and full cost; zero delivery alone cannot retire a live gate |
| DR03 | `lab-test` at sh-167 for scoped authority over preserve/replace/revoke | same code under authorized and unauthorized retirement must change oracle verdict; semantic mutants must fail |
| DR04 | `defer` typed proof-closure certificate; keep sh-165's narrower tracked-tree receipt | ignored input read by check changes verdict without key change; only a real reuse consumer justifies added dependency declarations |
| DR05 | `lab-test` at sh-168 for B versus matched regression G; sh-163 keeps its preregistered arms and thresholds | freeze unit, oracle, feedback parity, stop threshold, invalid/retry and tokens plus wall; five continuation cells cannot yield a causal CI |
| DR06 | `adopt` five initially known sh-166 repair targets under capability owner; candidate remains uninstalled | source → installed → current-process readback for permitted, denied and project skills; the report established no sixth defect, while later local review found a further KRN-origin case |
| DR07 | `adopt` instruction repair finding in sh-170 for `ask-gpt` authority; loading cause `defer` | remote-only question without push; source/Project divergence and a session load trace |
| DR08 | `adopt` installed alias defect into sh-170 coverage; adapter simplification `lab-test` | installed alias fails while canonical CLI passes; invalid capsule and reconcile-changing frontier probes still designed |
| DR09 | `reject` a duplicate release receipt; existing seal retains revision/artifact identity | a fresh host process must show loaded artifact/config; current override-unsealed install and CLI smoke do not supply that |
| DR10 | `reject` its local ticket amendments and categorical deletion-win claim; retain no-new-layer stop | it lacked local reports/tickets, mapped owners incorrectly, and pre-sh-144 memory trials cannot establish zero benefit |

## Ordered work and dependency graph

| Ticket | One observable outcome | Required predecessor and reason | Deciding boundary |
|---|---|---|---|
| sh-171 | PreCompact writes the boundary without emitting SessionStart-specific JSON | none; operator-observed hook protocol error | done: focused observer red against old hook and green after repair, direct installed PreCompact output empty, fresh SessionStart continuation observed; live compaction event remains unobserved |
| sh-172 | Named `git restore` files pass the hook while glob, root and protected targets stay blocked | sh-171 fixed the prior hook release used as its base | integrated at `6ff0a3a`; full gate passed on merged descendant `61b9366`, and sealed `10fd088` installed with matching hook SHA; a live fresh-session PreToolUse restore remains unobserved |
| sh-166 | The declared capability profile resolves to the intended effective host surface without duplicate or incorrectly hidden owners | none; preserved WIP already exists | initial cases and KRN-origin counterexample red→green; full gate, sealed install and fresh Codex/OpenCode configuration readback passed at `10fd088`; terminal ticket review remains |
| sh-173 | The declared compatibility catalog command works from an installed release | sh-166 release is its delivery vehicle, not a behavioral dependency | installed-bin fixture failed before repair and passed after; alias and canonical CLI returned identical profile lists from sealed `10fd088`; external caller audit remains |
| sh-167 | The trajectory oracle distinguishes preserved behavior, legal replacement and unauthorized loss | none; instrument qualification is independent of binding | gold implementations pass, semantic mutants fail, and identical code with different retirement authority receives the correct verdict |
| sh-165 | All advancement consumers use one executed requirement/proof inspector | existing sh-161; the cumulative evaluator is its consumer seam | preserve compliant successor history; prove final observer at base/head, migrate historical proof claims honestly, isolate test temp roots, complete gates before publication |
| sh-168 | A bounded causal screen decides whether binding adds value over reminder and regression feedback | sh-167 supplies a valid oracle; sh-165 supplies the candidate mechanism | five matched checkpoint continuations, then only the informative contrast on a non-rename case; count all feedback, repairs and cost; stop on oracle failure or regression-only dominance |
| sh-163 | A preregistered larger comparison makes a bounded promotion decision | sh-165 and sh-168; runnable candidate and a screen that warrants scaling | existing three-arm 24-matched-trajectory acceptance stays; add causal control explicitly, freeze paired inference and costs; insufficient evidence remains inconclusive |
| sh-169 | A fresh session can use an agent-authored capsule, with its writing failures visible | none; run against one explicitly pinned supported revision | continue one real boundary with capsule/transcript/repository-only controls; include a revoked-obligation counterexample and native Goal baseline; measure current intent, authority, scope, unresolved work and cost, not merely ABI validity |
| sh-170 | Every owned repository surface has evidence of its consumer, or an explicit retain/repair/retire/defer disposition | none; read-only coverage can proceed independently | one bounded coverage pass over all owned groups, at most ten prioritized findings; include the reproduced installed catalog alias failure, duplicated host state/frontier readers and `ask-gpt` authority drift; no new runtime architecture or second registry |
| sh-174 | Decide the smallest complete memory product and retire or justify each current surface | current ADR 0001/0006 boundaries and sh-170 coverage are input; no task backend dependency | owner/consumer/retirement map, current-versus-native baseline, one real continuation and one stale-knowledge counterexample, full context cost, and an explicit retained reference contract or no-link decision |
| sh-175 | Deliver the human task product and replace the operating queue once | sh-174 must settle what a task may reference and which memory owner resolves it | full operator flow, shared-worktree claim and recovery, import/rollback and all-reader cutover; one live store and no duplicated claim or lesson state |

That sh-174 → sh-175 edge was the 2026-09-23 priority. Both task records now
report `done`; their achieved import and retirement evidence stays in the queue
and [ticket-protocol.md](ticket-protocol.md), not in a fresh planning claim.
The research edges sh-167 + sh-165 → sh-168 → sh-163 remain. sh-160 keeps its
operator gate; a measured Laya-guard loss did not earn another default model.
Task resolution, not this paragraph, controls eligibility.

## Current target delivery graph

At clean main `d260bcbd` (2026-09-27), PRs #246/#247 are merged and their
branches retired; the installed sealed release remains `6f50e815`. The
Git-ref queue readback has 101 tasks, 77 warnings, no errors: `sh-167` and
`sh-180` are both `claimed` by the sole integrator, but only `sh-180` is
being implemented. An executed public `sh-167` close exited 64 because an
imported Contract requires an operation readback while `operation prepare`
admits only lane tasks; its patch is integrated, its queue state is **not done**.
`sh-169` is `ready`, yet its valid agent-authored/native-Goal/revoked-task
pilot and authentic Codex hook trust are still missing. `sh-165` remains
`deferred`; the live queue decides all published statuses. The earlier
research branch's two uncommitted files remain untouched.

The current Goal is one outcome and Sol is the sole writing integrator. The
operator selected `krn task` as the final public name **without a `krn ticket`
alias**. Astra handles bounded read-only architecture questions; Luna through
`openai-codex` and DeepSeek v4.1 Flash handle pinned read-only work until a
separate writing-worker isolation and cost trial earns any expansion. Herdr
shows panes and host agent state, not authoritative queue or completion state.
Publication of new task records is a separate, read-back transition. The
staged units below do not assert that proposed commands, adapters or storage
fields already exist. A research or experiment unit is not mislabelled as an
implementation-ready ticket. Dependencies are load-bearing; a conditional
unit stays deferred until its named failure is observed.

| Unit / type / owner | Prerequisite and result that can disagree |
|---|---|
| D0 — `sh-180`, repair, ticket CLI owner | Claimed and being worked now. An imported proof-gated non-lane task can close **after** a verified merged effect via the public command and queue/ref readback, while a forged receipt, wrong trailer/contract/scope, stale claim or moved target refuses without writing `done`. No bypass or second effect ref. Then resolve `sh-167` with its actual limited, fixture-scoped evidence; real-user authentication remains open. |
| D1 — `krn task` public cutover, migration, task owner | D0. Expand only inside the candidate: one canonical Git-ref queue and current readers remain valid. Migrate live CLI, hooks, skills, scripts, tests, instructions, help, install links and change trailers with frozen positive/negative controls. Contract only after no live `ticket` caller remains: shipped `krn ticket` refuses as an old command, not an alias. Preserve historical commit trailers and stable task IDs; prove lossless export/restore and rollback before deleting the old command. |
| D2 — Pi/host first-message readback, instrument, `$delivery-loop` | Read-only discovery can start before D1; production command/hook cutover waits for D1. A fresh supported Pi session reads its actual branch-local Pi-Agent-Goal state and project instructions; a fresh Codex session loads the trusted capsule hook; disabled treatment still works natively. Pi Goal 2026.7.18 peer range `<0.81` against host0.87 needs a live compatibility check. The operator, not `install check`, witnesses `/hooks` trust. |
| D3 — user-authority ingress, decision then implementation, task/host owner | D1 plus one genuine host/operator source identified in D2. Record scoped preserve/replace/revoke against an expected intent revision by CAS, refuse forged/missing source and maintain omissions by default; no agent text approves itself. If the host cannot surface an authenticated event, use a deliberate operator confirmation, not an invented `source` label. |
| D4 — `sh-169`, blinded *experiment*, `$delivery-loop` | D2 + D3, and one authentic post-checkpoint task authority transition. Compare native Goal/live task+repo, agent-written capsule and matched excerpt at one model/tool/window with frozen hidden independent scoring; count writing, reading, retries, regression and total cost. One case screens only. A saturated or invalid control stops promotion. |
| D5 — next-decision frame, *conditional* prototype then implementation, state/task owner | Only a concrete native failure in D4. First manually construct and falsify the smallest bounded source/obligation/evidence view against direct live reading. Add a stateless read interface only if a current owner and second real caller use it and a paired downstream decision improves at counted cost. Otherwise reject this runtime mechanism; never create a second authoritative store. |
| D6 — targeted recall/index, *conditional* experiment, maintainer | Repeated decision-relevant source misses after D4/D5 and link/lexical repair. Compare task-grounded complete evidence against live map+Git+grep; introduce only a rebuildable FTS index if accuracy and whole-workflow cost justify it. No automatic task-comment-to-lesson promotion, vector DB or graph by popularity. |
| D7a — `sh-165`, deferred design/implementation decision, trajectory owner | Source `sh-161` is done but this task is deferred. Preserve its historical candidate evidence, qualify hidden inputs and exact proof reuse before changing its status; no automatic un-defer from a green unrelated gate. |
| D7b — `sh-168`, preregistered causal experiment, trajectory owner | **Both** `sh-167` honestly resolved and D7a's sh-165 candidate valid. Identical ordinary-regression feedback for G and B; gold legal replacement and semantic mutants first; report false blocks, recovery, complete tokens and wall. Stop if G matches B at lower cost. |
| D7c — `sh-163`, conditional scale experiment, maintainer | D7b informative. Keep its three-arm 24-matched-trajectory criterion, separate regression-only control, positive paired bounds and existing separate ≤1.25× token and wall gates; insufficient power remains inconclusive. |
| D8 — Pi/Herdr worker transport, *read-only lab-test*, host owner | D2 for final UI, though disposable read-only probes may run now. Pin Sol owner; child Luna/DeepSeek model, SHA, narrow files, tools, deadline, cancellation and total usage; Herdr reports pane status only. Negative: 429, missing `agent_settled`, process-tree survivor or out-of-scope access fails. Writing workers need a separately passed OS-isolation and accepted-repair throughput trial. |
| D9 — transfer, real catch and cost, outcome *measurement*, Goal integrator | Valid D4 or D5 intervention plus qualified oracle. One different-shaped repository, a native-failing case, a real defect native would ship, false blocks and child/integrator cost. A green gate or N=1 comparison does not establish product superiority. |
| D10 — release and rollback, installer/host owner | Each landed slice gets focused/owning checks, validate, audit, diff, clean full gate, independent review, authorized merge and branch retirement. At a settled fixed point seal/install, exercise rollback to verified previous release, and observe fresh host loading; never infer hook trust or Pi continuation from filesystem equality. |
| D11 — repository hygiene, audit owner | **After** the measurement decision. Test-audit one subsystem at a time with R/F/C/D, keeper and mutant; correct only receipt-backed warning classes, preserve the foreign WIP and defer F repairs without their transcript. Report null benefit and retire unearned surfaces rather than manufacture a breakthrough. |

The source-backed target interfaces, memory planes, chosen local storage and
failure/scale matrix live only in [product-architecture.md](product-architecture.md).
An external source does not authorize an implementation; this graph is consumed
one uncertainty at a time, and `$slice-work` publishes only settled units with
a named falsifier and real status readback. If native controls saturate or win,
D5/D6/D7c and writing-worker machinery remain unbuilt or are removed. No
roadmap row can close the active Goal by itself.

## Coverage of the whole repository

| Surface | Existing authority / consumer | Unresolved question carried by the plan |
|---|---|---|
| Global instructions and capability exposure | global contract, capability owner, host session | source identity, optional explicit invocation, project/global preservation and actual host readback — sh-166 |
| Requirements, proof and late changes | delivery-loop, state inspector, trajectory evaluator | applicability versus freshness; legal supersession and ordinary regression baseline — sh-167/165/168/163 |
| Capsule writing, compaction and restart | delivery-loop and a fresh continuation | can an agent write sufficient current memory rather than merely consume a lab-authored capsule — sh-169 |
| Lessons, recall, research and ADR | named readers and retirement rules in the memory wiring map | which records affect decisions and which only satisfy their own checker — sh-170 |
| CLI, kernel, hooks and adapters | public command callers and host interception | runtime closure, duplicate responsibilities, truthful error and authority boundaries — sh-170 |
| Ticket/lane/review/publication | configured queue, fixed-point review and CI | consistent identity, ownership and evidence across transitions — sh-170 |
| Install, export, seal and rollback | installation owner and operator | source bytes versus installed bytes versus effective process; preserve user configuration — sh-166/170 |
| Tests and research provenance | deterministic falsifiers and source-to-decision | oracle validity, self-confirming checks, primary-source claims and full costs — sh-167/168/170 |

Coverage is not proof of perfection. Each investigation reports inspected,
uninspected, observed and inferred separately. A promising paper is a source
for a competing mechanism, never sufficient evidence of KRN benefit.

The sh-170 coverage pass at source HEAD `1e37511c7b29cb7ea45059009f3f13184fc04a11`
and then-installed release `9f18ab2442ab0f920e2aa8753228e12dc0c7c549`
found a broken `krn-codex-catalog` alias and two live retired-name hints. sh-173
repointed the wrapper at shipped `krn.mjs`, corrected the hints, passed an
installed-bin fixture red to green, and the sealed `10fd088` release passed
installed CLI readback. External caller evidence still decides alias
retirement. The delivery-loop
archive instruction now covers every discovered ticket under `.krn/tickets/`;
a disposable two-root restore preserved the path and ID set.
`ask-gpt` instruction repair now conditions publication on the selected remote
evidence and keeps ChatGPT Project as optional context, while a session load
trace remains unobserved;
OpenCode's queue reader now uses the ticket owner's read-only check after an
invalid-ticket red/green counterexample; its capsule reader, `boundary.md`
retention and skill activation still need
their named behavioral checks before a new owner or layer is justified. The
pass found no reason to add a registry, selector or CLI facade.

The user clarified that the task goal is a lighter, complete KRN alternative
to Beads, not merely a wrapper around the existing envelope or a migration to
Beads. [Ticket protocol](ticket-protocol.md) records the bounded replacement
candidate: one transactional queue shared by linked worktrees, a complete
`add → ready → claim → comment → close` flow, an optional lane recipe, and a
single claim record. Its two-worktree contention and import/rollback checks
must pass before replacing the operating ABI. This is a separate queue
architecture decision under sh-170's consumer audit, not part of the sh-166
release or permission to build a second live store.

The architecture review sharpened the later task sequence: after sh-174 fixes
the memory boundary, prove a supported Node driver and complete human task
loop; then claim fencing and lane proof at one fixed point; then lossless import
plus every queue reader (state candidate resolution, Codex hook, OpenCode
plugin and delivery-loop archive); finally switch and delete old live files,
locks and parser. An optional task brief may compose explicit knowledge links
and provisional scope matches only under the reference contract selected by
sh-174. It must beat task display plus manual recall on a real decision without
copying memory or weakening the final diff-based check. The old CLI cannot faithfully read a
human `done` without an integrated commit anchor, so post-cutover recovery
cannot be described as rollback to the old CLI. These remain sh-170 trial
conditions carried into sh-175, not a new runtime lane in this release.

## Research and deletion discipline

Use bounded read-only Astra tasks for independent questions; available slots
limit actual concurrency. Root synthesizes and implements only when execution
is resumed. Each finding needs a path/line or primary-source reference, a
counterexample, a falsifier, non-proofs and one sharp thesis. Do not assign
implementation tickets to a research swarm or create one durable report per
agent.

Retain at most two candidate mechanisms: complete intent transitions and
source-derived capability composition. Compare against unchanged/native
behavior, ordinary regression and deletion where applicable. A graph, store,
selector, proxy, prompt instruction or permanent test must earn a real consumer.
Negative or null results close an experiment without justifying another layer.

## Candidate mechanisms and rejection boundaries

No new pattern is adopted by the report campaign. The only two conditional
candidates retain their existing owners and must beat simpler controls:

| Candidate | Owner and consumer | Smallest possible change | Deciding falsifier and full cost | Boundary and rejection |
|---|---|---|---|---|
| Scoped intent transition | `$source-to-decision` returns the decision; sh-167's oracle author writes the instrument; sh-168 consumes it | represent preserve/replace/revoke for current obligations with explicit scope and authority in the existing request/capsule seam | gold legal replacement and identical-code authorized/unauthorized revoke pair, plus independent semantic mutants; cost includes annotating current obligations, reviewing authority, running checks and false blocks | lab-test only; reject if gold legal evolution fails, a mutant survives, authority is guessed from code, or ordinary regression G matches binding B at no greater cost |
| Source-derived capability composition | `$managing-codex-capabilities`; current Codex/OpenCode sessions consume one effective owner | repair sh-166's admission cases in the existing catalog/host adapter and use source, installed and current-process readback | foreign upstream and KRN origins, wildcard/exact, scalar, nongit and subdirectory controls followed by fresh host discovery; cost includes inventory/digest checks, profile reconciliation, restart/readback and operator repair | source equality does not prove host loading; reject an extra composition layer if the existing profile plus exact owner exclusion and readback converges, or if it erases user/project authority |

Proof freshness remains the simpler sh-165 tracked-tree receipt with a stated
hidden-input limit. A typed closure certificate is `defer` until an ignored or
host input falsifier demonstrates that the current consumer needs reuse rather
than a fresh check. Agent-facing lesson delivery stays retired; deterministic
`changes check` recall retains its separate consumer. A zero-delivery lesson is
reviewed, not deleted solely for a null count; the direct evaluator exposure
in local-lane results was closed only at sh-144, not sh-142.

Supersede this roadmap when these frontier decisions are resolved or the user
changes the outcome. Rewrite the affected rows and keep ticket status solely in
the queue; remove this page when no later maintainer consumes the plan.
