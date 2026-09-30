# Self-hardening research and delivery roadmap

Status: `accepted`. Consumer: the maintainer resuming self-hardening.
Owner: maintainer. Verified: 2026-09-30.
The 2026-09-30 refresh plans audited repairs and a fresh-context handoff;
older dated experiments and host observations retain their original scope.

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

The read-only audit used `c13652f4745472ef4cb67eff2fe242956c30e4c9`.
Its live queue read had 112 records and 13 neither done nor abandoned despite
an empty frontier: deferred `sh-165` blocked `sh-168` and `sh-163`, `sh-184`
was claimed at epoch 4, and historical in-review tasks lacked closure readback.
Zero unfinished effect operations would not discharge those tasks. The
installed release matched that SHA by value; filesystem inspection still
reported host-session loading unobservable. A later `.krn` hash changed during
the audit, so complete checkout non-mutation was not established; tracked
files, refs and monitored installation/configuration were unchanged at that
boundary. No cause was attributed and no old capsule was rewritten.

PR #288 landed the first instruction/research cleanup at
`f550c6317c44b912473afa2b7a927a2f080d61d4`; independent Standards/Spec review,
remote fast/deep CI and the local merged full gate passed. This is evidence
of that slice, not runtime repairs or agent-performance uplift. The follow-up
planning item is `task-hardening-plan-20260930`. The queue owns every claim and
published task status; read it before choosing implementation. Existing
sh-165/166/170/173/184/185/186 and their gates are not automatically resumed,
taken over or closed by this plan. The completed task CLI cutover retains its
queue/history evidence; source changes alone still do not certify a loaded host.

The Goal is one outcome and has one writing integrator. The operator selected
`krn task` without a final `krn ticket` alias; `sh-181` only expands the new
CLI while the old name remains temporarily reachable. The current model/Herdr
policy and its limits live in [product-architecture.md](product-architecture.md#runtime-and-host-profile):
Sol owns implementation, GPT-6 Luna handles bounded read-only questions and
GPT-6 Astra is rare and question-justified. The recorded operator delegation
covers routine bounded publication without repeated prompts; install, seal and
real hook trust retain separate authority. New task publication remains a
separate read-back transition. Units below are stages, not claims that
proposed mechanisms already shipped; conditional work requires its failure
trigger and the active queue's eligibility.

### Audited hardening slices (2026-09-30)

These ten units order the new repair campaign. Their task IDs are execution
records, not a second status table. The task body carries each finding's
severity, source path/line, consumer, evidence class, counterargument, cheapest
falsifier and no-change alternative. A reproduced policy result, a static
race/path analysis, a hypothesis and an evidence gap are different claims.
Every bug is reproduced at its consumer before implementation; a failed
setup is not a valid RED, and no supplied green receipt proves execution.

| Slice / owner | Tasks and acceptance | Dependency / no-change boundary |
|---|---|---|
| H1: literal hook policy, hook owner | `hardening-git-alias`, `hardening-copy-target`, `hardening-shell-redirection`: the three reproduced policy bypasses refuse while benign counterparts remain allowed; exercise actual host adapter payloads without executing destructive commands | first runnable repair after this plan lands; guard remains a mistake-catcher, not an OS sandbox |
| H2: quarantine projection, capability owner | `hardening-quarantine`: forbidden names do not retain existing allow through the OpenCode projection; `hardening-skill-identity` first diagnoses directory/frontmatter selector identity against the real consumer | source fixtures can follow H1; fresh host evidence and any installed change require their own grant |
| H3: queue lifecycle/readback, task owner | `hardening-task-recovery`, `hardening-effect-cas`, `hardening-lease-input`, `hardening-selector-read`, `hardening-next-errors`: legal recovery, exact atomic readback, valid imported leases and selected-only truthful reads; preserve IDs, epochs and history | each uses current public task flow, not hand-edited refs; no automatic takeover, un-defer or old-task closure |
| H4: proof and evaluator integrity, contract/kernel/conformance owners | `hardening-observer-preservation`, `hardening-frozen-base`, `hardening-tap-classification`, plus diagnostic `hardening-proof-origin`: reject the regressions each current observer misses while allowing explicitly authorized acceptance evolution | repairs must retain legal test retirement such as PR #288; a graph, judge or self-authored checkResult is not a proof fix |
| H5: install ownership/seal, installer | `hardening-current-binding`, `hardening-seal-root`: inspect/apply agree about owned current; seal cannot write a ledger into an installed release or its alias | disposable homes/releases only; no live install, rollback, prune or trust action implied |
| H6: state and capsule consumers, state/adapter owners | `hardening-state-markup`, `hardening-run-alias`, `hardening-review-containment`, `hardening-head-unknown`: accepted field syntax reaches the brief, physical run identity agrees, evidence is contained and unavailable freshness is explicit | repair consumer behavior without promoting capsule structure to task/authority proof or rewriting another outcome |
| H7: normalized workspace lifecycle, kernel/lane/harness owners | `hardening-workspace-frontier`, `hardening-workspace-cleanup`, `hardening-workspace-copy`; diagnose `hardening-benchmark-retention`, `hardening-legacy-integrator`, `hardening-publication-binding`, `hardening-lane-retirement`: run-scoped paths, truthful owned cleanup, no copied private/source-linked state and checked publication identities | H4/H3 constrain any integration change; retained candidate/evidence after ambiguous effects must keep a named recovery consumer; temporary fixtures, Git locks and atomic install staging are explicit exceptions |
| H8: knowledge, telemetry and setup, current knowledge/catalog/setup owners | `hardening-usage-evidence`, `hardening-live-docs`, `hardening-repro-scope`, `hardening-setup-delivery`, `hardening-setup-plan`, `hardening-cli-surface`, `hardening-cli-integration`: attempts are not successful body reads, operational docs name live interfaces, proof labels match observers, setup shows exact effects, and existing show/fields/env/root/error contracts are qualified before adding wrappers | use existing topics and commands; do not mirror manifests or create AGENTS.memory, onboarding framework or empty documentation by default |
| H9: instruction/workflow qualification, existing LT/integrator owners | `hardening-workflow-eval`, `hardening-memory-usefulness`: matched existing-versus-minimal task journeys separate delivery, selection, execution and effect; qualify current memory/lesson/continuation/knowledge composition against real misses, with calibrated independent acceptance, all retries and untouched final evaluation | only after relevant H1-H8 controls; single-case screens qualify the instrument, not uplift; existing sh-169/sh-185/D4 gates remain separate |
| H10: measured simplification and release, maintainer/installer | `hardening-simplification`: retire a surface only after migrating its actual consumers and preserving proof/rollback; decide retain/reduce/reject from a discriminating result | no blanket skill/doc/test deletion or new graph/store/controller; host release remains operator-gated; null benefit is an honest terminal decision |

The path contract and three design alternatives live in
[product-architecture.md](product-architecture.md#design-alternatives-and-bounded-recommendation-2026-09-30).
The recommended candidate is native-host execution plus deep existing owners,
common-user clarity, and action-specific correctness invariants. ADR 0006's
installed defaults remain in force; opt-in replacement is an unresolved product
choice, not adopted because a model recommended it. Short labels or a new CLI
facade must reduce caller obligations, not merely hide them.

### Existing product and experiment gates

D0-D11 retain their decision dependencies and historical qualification. They
are not additional mandatory stages for every repair or a cache of live task
status. In particular, H1-H8 correctness work does not require stealing the
unrelated sh-184 claim, and a read-only review needs no implementation claim.
An experiment still needs its actual predecessor and authority, not merely a
new planning row.

| Unit / type / owner | Prerequisite and result that can disagree |
|---|---|
| D0: `sh-180`, proof-close repair, task owner | **Done** via PR #249 and public CLI; `sh-167` was then closed with its actual fixture-scoped evidence. Forged receipt, wrong trailer/scope, stale claim or moved target refuse without writing `done`. Authentic user authority is still D3, not established by this close. |
| D1: `krn task` public cutover, task owner | Source cutover and retirement through sh-181/sh-182/sh-183 are delivered; `task` reaches the selected queue and `ticket` refuses with a migration hint. Preserve task IDs, historical Markdown ABI, Git history, export/restore and rollback. Their immutable evidence stays in the queue; installed and loaded-host identity still require separate observations. |
| D2: `sh-184`, Pi/host first-message readback, `$delivery-loop` | Read its current claim and evidence; do not infer completion or permission to take over. Read-only discovery can proceed independently. A fresh supported Pi session reads its actual branch-local Pi-Agent-Goal state and project instructions; a fresh Codex session loads the trusted capsule hook; disabled treatment still works natively. Pi Goal 2026.7.18 peers `<0.81` against host0.87 need live compatibility, bounded idle continuation and restart checks. The operator, not `install check`, witnesses `/hooks` trust. |
| D3: `sh-185`, user-authority ingress, task/host owner | **Open**, blocked by `sh-183` and `sh-184`. Identify one genuine host/operator source, then bind scoped preserve/replace/revoke against expected task intent revision by CAS. Omitted obligations stay active and unverifiable source refuses; if host authentication cannot be observed, require deliberate operator confirmation rather than an invented source label. |
| D4: `sh-169`, blinded *experiment*, `$delivery-loop` | **Open**, blocked by `sh-185` and an authentic post-checkpoint authority transition. Compare native Goal/live task+repo, agent-written capsule and matched excerpt at one model/tool/window with a frozen independent scorer; count writing, reading, retries, regression and whole-workflow cost. One case screens only; saturated or invalid control stops promotion. |
| D5: next-decision frame, *conditional* prototype then implementation, state/task owner | Only a concrete native failure in D4. First manually construct and falsify the smallest bounded source/obligation/evidence view against direct live reading. Add a stateless read interface only if a current owner and second real caller use it and a paired downstream decision improves at counted cost. Otherwise reject this runtime mechanism; never create a second authoritative store. |
| D6: targeted recall/index, *conditional* experiment, maintainer | Repeated decision-relevant source misses after D4/D5 and link/lexical repair. Compare task-grounded complete evidence against live map+Git+grep; introduce only a rebuildable FTS index if accuracy and whole-workflow cost justify it. No automatic task-comment-to-lesson promotion, vector DB or graph by popularity. |
| D7a: `sh-165`, deferred design/implementation decision, trajectory owner | Source `sh-161` is done but this task is deferred. Preserve its historical candidate evidence, qualify hidden inputs and exact proof reuse before changing its status; no automatic un-defer from a green unrelated gate. |
| D7b: `sh-168`, preregistered causal experiment, trajectory owner | **Both** `sh-167` honestly resolved and D7a's sh-165 candidate valid. Identical ordinary-regression feedback for G and B; gold legal replacement and semantic mutants first; report false blocks, recovery, complete tokens and wall. Stop if G matches B at lower cost. |
| D7c: `sh-163`, conditional scale experiment, maintainer | D7b informative. Keep its three-arm 24-matched-trajectory criterion, separate regression-only control, positive paired bounds and existing separate ≤1.25× token and wall gates; insufficient power remains inconclusive. |
| D8: `sh-186`, Pi/Herdr worker transport, *read-only lab-test*, host owner | **Open**, blocked by `sh-184`; a disposable no-tools probe may run sooner but cannot approve the profile. Pin Sol owner and a GPT-6 Luna child to SHA, files, tools, deadline, cancellation and total usage; Astra is reserved for a justified rare complex question. Herdr reports pane state only. A historical DeepSeek timeout lacked `message_end`, `agent_settled` and billed usage: unavailable, not a passed worker. Negative 429, process-tree survivor, cross-scope read and secret leak must fail before any writing-worker OS-isolation/throughput trial. |
| D9: transfer, real catch and cost, outcome *measurement*, Goal integrator | Valid D4 or D5 intervention plus qualified oracle. One different-shaped repository, a native-failing case, a real defect native would ship, false blocks and child/integrator cost. A green gate or N=1 comparison does not establish product superiority. |
| D10: release and rollback, installer/host owner | Each landed slice gets focused/owning checks, validate, audit, diff, clean full gate, independent review, authorized merge and branch retirement. At a settled fixed point seal/install, exercise rollback to verified previous release, and observe fresh host loading; never infer hook trust or Pi continuation from filesystem equality. |
| D11: repository hygiene, audit owner | **After** the measurement decision. Test-audit one subsystem at a time with R/F/C/D, keeper and mutant; correct only receipt-backed warning classes, preserve the foreign WIP and defer F repairs without their transcript. Report null benefit and retire unearned surfaces rather than manufacture a breakthrough. |

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
| Global instructions and capability exposure | global contract, capability owner, host session | source identity, optional explicit invocation, project/global preservation and actual host readback; sh-166 |
| Requirements, proof and late changes | delivery-loop, state inspector, trajectory evaluator | applicability versus freshness; legal supersession and ordinary regression baseline; sh-167/165/168/163 |
| Capsule writing, compaction and restart | delivery-loop and a fresh continuation | can an agent write sufficient current memory rather than merely consume a lab-authored capsule; sh-169 |
| Lessons, recall, research and ADR | named readers and retirement rules in the memory wiring map | which records affect decisions and which only satisfy their own checker; sh-170 |
| CLI, kernel, hooks and adapters | public command callers and host interception | runtime closure, duplicate responsibilities, truthful error and authority boundaries; sh-170 |
| Ticket/lane/review/publication | configured queue, fixed-point review and CI | consistent identity, ownership and evidence across transitions; sh-170 |
| Install, export, seal and rollback | installation owner and operator | source bytes versus installed bytes versus effective process; preserve user configuration; sh-166/170 |
| Tests and research provenance | deterministic falsifiers and source-to-decision | oracle validity, self-confirming checks, primary-source claims and full costs; sh-167/168/170 |

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

Use Sol directly for the writing decision, bounded GPT-6 Luna for narrow
read-only questions, and GPT-6 Astra rarely when a complex question merits its
cost; the current operator policy is owned by the Goal and target topology.
Each finding needs a path/line or primary-source reference, a
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
