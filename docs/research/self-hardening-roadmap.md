# Self-hardening research and delivery roadmap

Status: `accepted`. Consumer: the maintainer resuming self-hardening.
Owner: maintainer. Verified: 2026-09-23.

This page owns the bounded plan and its decision dependencies. The configured
local queue owns ticket status and claims; [orchestration.md](orchestration.md)
owns research mechanisms, [capabilities](../capabilities.md) owns capability
policy, and the outcome capsule owns current operational state. This is not a
second queue or a claim that the planned mechanisms work.

## Current decision and execution boundary

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

## Product completion order: memory, then tasks

The 2026-09-23 operator priority is sequential: finish the memory product
before selecting or cutting over the replacement task store. These are two
owned outcomes, sh-174 then sh-175; sh-170's repository coverage remains
historical input, not a combined implementation ticket. Existing sh-165/sh-167
through sh-169 research gates retain their own authority but do not turn this
product sequence into parallel runtime work.

| Phase | Question and current baseline | Exit condition before the next phase |
|---|---|---|
| sh-174: memory | Separate outcome continuation, durable shared knowledge and reusable workflow lessons from task history. Native Goal plus repository reading and the current KRN surfaces are baselines. At source `109193e`, lessons has 25 rows, 20 active and four active triggers; one triggered row has no `Recall:` binding. | Map every writer, reader, invalidation and retirement path; classify active lessons as retain, simplify or retire; test one real continuation/retrieval decision with a stale or retired counterexample and full context cost. Decide the smallest memory contract and whether task links need any resolver. Do not assume the current lessons table is permanent. |
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

The active product edge is sh-174 → sh-175, one phase at a time. The separate
research edges are sh-167 + sh-165 → sh-168 → sh-163. sh-171 is done;
sh-172 is integrated; sh-166 owns the installed release. sh-169's capsule
writing question informs sh-174 without becoming a second memory writer.

Earlier queue work is preserved: sh-156 and sh-159 are done; sh-157 and sh-158
were superseded by sh-161/162/163. sh-162 is preserved and sh-165 is its compliant
publication successor. sh-160 keeps its operator gate; the measured Laya guard
loss does not justify another model integration. Ticket resolution, not this
paragraph, controls execution eligibility.

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
archive instruction now covers every discovered ticket under `.scratch/` and
`.krn/tickets/`; a disposable two-root restore preserved the path and ID set.
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
