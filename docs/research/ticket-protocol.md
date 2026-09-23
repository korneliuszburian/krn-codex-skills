# Ticket protocol

Status: `accepted`. Consumer: the maintainer, the lane runner, and any worker or
integrator session. Owner: maintainer. Verified: 2026-09-24.

## Decision question

How should one work item travel through planning, a worker session, the gates,
and the integrator without ad-hoc plumbing, so that any executor (Codex or
opencode), any tracker, and any repository read the same normalized artifact?

## What Beads establishes (source-backed)

Beads is the closest production system: a dependency-aware issue graph with
`bd ready` computing the frontier of unblocked work, atomic
`bd update <id> --claim`, hash-based short IDs, statuses (`open`, `in_progress`,
`blocked`, `closed`, `deferred`), typed non-blocking links (`relates-to`,
`duplicates`, `supersedes`, `replies-to`), labels, JSON output contracts, a
`lint` that checks issues for missing sections per type, commit-message issue
references with orphan detection in `doctor`, merge slots that serialize
conflict-prone work, async gates (human, timer, PR/CI), and issue metadata used
as the authoritative execution-hint channel: `execution_agent_type`,
`execution_suggested_model`, `execution_reasoning_effort`, `execution_mode`,
`execution_parallel_group`, read before spawning any worker. KRN adopts the
mechanics, not the product: no Dolt store, no daemon, and no second database.

## The KRN ticket ABI v1

One fenced block at the top of a ticket file, in any tracker (a local
`.scratch/` markdown file, a GitHub issue body, or a Beads description), parsed
deterministically as `Key: value` lines:

```text
<krn-ticket>
Id: <stable id, e.g. ticket-01 or the tracker key>
Title: <one line>
Status: ready | claimed | blocked | in-review | done | abandoned | deferred
Type: task | bug | refactor | research | decision | epic
Repository-base: <ref the worker cuts from, e.g. origin/main>
Scope: <comma-separated paths or globs the diff may touch>
Deciding check: <one command, red at the base and green after the work>
Contract: <check ref>:<red->green | green->green>
Acceptance: <one observable statement>
Blocked by: <comma-separated ids or none>
Recall: auto | <explicit trailer lines>
Execution: agent=<codex|opencode>; model=<id>; effort=<low|default|high>; parallel=<group>
Gate: <none | human:<what> | ci:<check> | tracker:<state>>
Claim: worker=<name>; session=<id>; at=<ISO-8601>
Evidence: <filled by the worker: executed checks, commit sha>
Non-proofs: <filled by the worker and integrator>
Resolution: <filled by the integrator: fixed point, review, publication state>
</krn-ticket>
```

The prose below the block stays human-facing: intent, context, acceptance
detail, and evidence notes.

## Lifecycle and frontier

- `ready` plus every `Blocked by` done is the **frontier**; the runner or the
  maintainer picks from it and writes `Claim:` before any work.
- A lane commit must carry a `Ticket: <id>` trailer; an open ticket whose id
  appears in a commit of the integrated branch, or a done ticket with no
  commit, is an **orphan** flagged by `ticket check` (Beads' `doctor` analog).
- `in-review` means the worker produced evidence and a commit; `done` is
  written only with a resolution (fixed point, review disposition, publication
  state) by the integrator; `blocked` names its gate.
- Cycle detection and unknown-blocker detection are blocking errors, exactly
  like Beads' dependency hygiene.

## Friction drain

`Workflow friction and lesson candidates` is a conveyor, not a graveyard: a
`candidate: <token>` entry must resolve before the outcome closes. A token
resolves when it names a `workflow-lessons.md` row anchor (the lesson text, a
backticked gate reference, or the falsifier file), a ticket id present under the
queue (`.scratch/` or `.krn/tickets`), or `deferred:<ticket>` for a ticket that
already exists there. A dangling token warns while the outcome is `ACTIVE` and
becomes a blocking `dangling-candidate` error at `COMPLETE`; undispositioned
free-text friction keeps `complete-with-friction` blocking. `state check`
enforces both, with `test/state/friction-drain.test.mjs` as the observer.

## Why this is better for KRN

- The deciding check and the contract are in the ticket, so the runner needs no
  env plumbing and the CI contract is derived, not remembered.
- Recall is derived from path, symbol, and churn triggers at the same place the
  change happens, so a lane commit cannot silently miss a lesson trailer (the
  batch-4 failure class).
- Execution hints make model routing a ticket field read before the session,
  mirroring Beads' metadata hints while keeping the Codex-canonical policy.
- Everything stays a file (or a tracker field): no second store, no daemon,
  and the artifact is reviewable in the same diff as the work.

## Wiring map

- Runner: reads `Repository-base`, `Scope`, `Deciding check`, `Contract`,
  `Recall`, and `Execution` from the envelope; falls back to environment
  variables only for legacy tickets.
- Worker: receives the envelope, must commit exactly once with
  `Ticket: <id>`, `Change-contract:`, and the resolved recall trailers.
- Integrator: fills `Evidence`, `Non-proofs`, and `Resolution`, and closes the
  ticket with the merged fixed point.
- Frontier loop: `krn-codex ticket next` picks the first unblocked ready
  ticket, `krn-codex ticket claim` records `Claim` and `Status: claimed` before
  the lane, the envelope-driven run merges through the integrator, and
  `krn-codex ticket close` records `Evidence` and `Resolution` before the next
  frontier; the lab `run-frontier.sh` wires this with a run cap.
- Publication: one PR per iteration and adjacent tickets batch into one PR. A
  PR whose diff changes exported skill bytes is a **lane-integration merge**:
  the integrator merges it with a merge commit whose body is the exact
  lane-integration merge template — `merge: integrate <branch>`, a blank line,
  `Ticket: <id>`, then `Change-contract: <ref>:<direction>` — so the export
  marker commit stays in history; that merge commit keeps the worker commits,
  so its own body needs only `Ticket: <id>` and
  `Change-contract: <ref>:<direction>`. The sh-68 merge `464e535` and the sh-76
  merge `8098f11` changed harness and skill surfaces but carried empty bodies
  with no `Ticket:` or `Change-contract:`, and they are the witnesses for this
  rule. A code-only iteration may instead squash the lane into a single conventional
  commit, which discards the worker commits, so its body must carry every
  trailer the squashed worker commit carried — `Ticket: <id>`,
  `Change-contract:`, `Recall:`, `At-risk:`, and `Applicability-change:`, plus
  any future harness-read trailer — because the contract harness reads the integrated
  commit body, not the dropped lane commit. The integrator copies the trailers
  from the lane head before merging, so a squashed closure keeps its commit
  reference, its recall bindings, and its applicability withdrawal. The sh-71
  squash named only `Ticket:` and `Change-contract:` and dropped
  `Applicability-change:`, which reddened the change-contract check on `main`
  with `applicability-withdrawn`; that is the witness for that rule.
- `krn-codex ticket check --root .` validates envelopes, blockers, cycles,
  statuses, and orphans; `krn-codex ticket next --root .` prints the frontier;
  `krn-codex ticket claim|close` validates the transitions it writes.

## Limits and non-proofs

- The ABI is a convention; only the checks the CLI and the gates implement are
  enforced. A tracker that rewrites bodies can drop the block.
- One repository at a time; cross-repo dependencies and federation are out of
  scope until a measured consumer exists.
- The execution hints are advisory until a routing experiment measures them;
  the executor policy remains Codex-canonical with opencode supported.
- Orphan detection depends on the `Ticket:` trailer being written; it is a
  gate, not a proof of intent.
- The lab frontier loop merges locally without review or publication
  authority, and concurrent claims are not fenced: two loops can pick the same
  ready ticket until one claim lands.

## 2026-09-23 correction: the operator loop is incomplete

The current ABI is an operating compatibility contract, not the intended final
task product. At source `ad4b220`, `scripts/lib/ticket/ticket-cli.mjs` exposes
`check`, `next`, `claim`, `close`, `fail`, `fields`, and `env`; `show` is separate.
It cannot create a task or add a comment. A simple file needs nine required
fields before it enters the frontier, while claim state is written both into
the ticket and `.krn/claims/<id>.lock`. The source has 1,208 lines under
`scripts/lib/ticket/` and the ticket tests have 2,797 lines. These are file
counts, not a quality score; the missing daily operations and doubled claim
state are the decisive observations. The underlying seam error is that the
same required envelope serves as the human task, lane configuration, claim
record and proof receipt. A general task therefore inherits the lane's proof
fields while the issue operations a human expects never became first-class.

The installed Beads v1.0.4 exposes `create`, `ready --claim`, `comments add`,
dependency commands, and `close --reason` as one operator flow. Its current
[introduction](https://github.com/gastownhall/beads/blob/main/docs/index.md)
documents a Dolt-backed issue graph and a broader coordination product; that
page describes v1.3.0, so it does not prove the local v1.0.4 behavior. KRN
should match the useful flow for its own consumers without adopting Dolt,
tracker federation, formula machinery, or automatic remote sync.

**Disposition: `lab-test`, owner maintainer, consumer delivery-loop and lane
runner.** Trial one replacement queue module whose daily path is
`add`, `ready`, `claim` (also `claim --ready`), `comment`, and `close`.
`list`, `show`, and `check` are read views; `edit` changes dependencies or
content, and `release` records an abandoned claim. An ordinary task requires
only a title; its body is optional. The KRN lane recipe (base, scope, check,
contract, acceptance) is optional until
that task enters an automated lane. A claim, its owner and epoch, comments,
dependencies, and close result live in the same task record. Closing a lane
task still consumes the existing fixed-point proof; a general task can close
with a non-placeholder reason. Claim recovery is an explicit audited release
or takeover, rather than a second expiring lock file.

SQLite was the preferred **engine to trial** before H2 compared it with the
private ref and file candidates. Its [write transactions](https://www.sqlite.org/lang_transaction.html)
serialize claims. The trial used SQLite's default rollback journal;
[WAL](https://www.sqlite.org/wal.html) would need demonstrated concurrency
benefit and a verified SQLite library version with the WAL-reset fix. H2 did
not select SQLite: built-in `node:sqlite` does not cover KRN's advertised Node
`>=22` floor without a floor change or alternate driver. A database in the Git
common directory would **not** sync between separate clones; export/import
would remain explicit until a real sync consumer exists.

The selected storage direction is one private Git ref, `refs/krn/queue`, with
a versioned snapshot and expected-old compare-and-swap.
Git [shares ordinary refs across linked worktrees](https://git-scm.com/docs/git-worktree)
and [checks the expected old object](https://git-scm.com/docs/git-update-ref).
A disposable 2026-09-23 two-worktree race from the same absent ref returned one
successful update, one rejected update, and identical readback. The later H2
test-only comparison also passes the listed claim and effect-recovery cases
for the Git-ref adapter; it does not verify the production API. Backup, current
queue import and rollback remain open. The repaired-file candidate also passed
the listed fault points, but its total lock, export and recovery cost was not
shown lower. Keep the existing acceptance rule that reopens this selection if
an alternative meets the same guarantees at lower total cost. Beads uses
[embedded or server Dolt](https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md)
for versioned history and cross-clone sync; KRN should pay that cost only if
those become required here.

### H2 backend decision (2026-09-24, sh-175)

**Disposition: adopt the private Git-ref snapshot as the canonical backend for
the local task product.** The owner is the sh-175 maintainer; consumers are the
existing ticket CLI, lane, state, hook and OpenCode readers. This selects the
implementation direction only. The Markdown queue remains authoritative until
the cutover contract below passes.

**Observed trial.** The H2 test-only comparison passed the same task, claim,
completion and recovery falsifiers for the single JSON file, Git-ref and SQLite
candidates on Node 26.2.0 and 22.14.0; its executed cases are in
`test/ticket/task-product.test.mjs`. Git's `update-ref` checks an expected old
object before replacing a ref, and ordinary refs are shared across linked
worktrees ([Git `update-ref`](https://git-scm.com/docs/git-update-ref),
[Git worktrees](https://git-scm.com/docs/git-worktree)).

**Source claims.** The Node v22.11 docs say `node:sqlite` was added in v22.5,
was active development, and required an experimental flag. The v22.14 docs
still mark the API active development, though the flag is no longer required
([Node.js v22.11 SQLite](https://nodejs.org/download/release/v22.11.0/docs/api/sqlite.html),
[Node.js v22.14 SQLite](https://nodejs.org/download/release/v22.14.0/docs/api/sqlite.html)).

**Local inference.** Git is already required by KRN, and its expected-old ref
update supplies compare-and-swap without a new runtime dependency or custom
claim-lock recovery. The file candidate passed the listed cases, but this
comparison did not establish a lower lifecycle, backup or recovery cost for
it. Built-in SQLite does not cover KRN's advertised Node `>=22` range without
a floor change; an alternate driver would add an unmeasured install cost. Those
local trade-offs motivate the Git-ref selection; they are not measured
performance results.

**Falsifier and non-proof.** Reopen the selection if the full production
acceptance below fails or if a supported file/SQLite implementation proves a
lower total operating cost. The adapters are test-only; they do not prove
production import, rollback, installation cost, performance or cross-clone
synchronization. No current queue data has been imported.

The smallest product falsifier is two linked worktrees claiming the same ready
ID: exactly one may succeed, and a reopened queue must have one claim and no
sidecar lock. The H2 adapter comparison exercised this case, but the production
CLI remains untested. Before cutover, verify the full `add → ready → claim →
comment → close → reopen` path, interruption before and after an effect,
duplicate retry after an ambiguous response, blocker cycles, and a lossless
import of the current path/ID set. The import first reports unmapped fields
and keeps old files read-only; cutover changes readers and writers together;
deletion of `.scratch` tickets, `.krn/claims`, the old parser/reconcile code,
and stale instructions follows only after readback and rollback export. A Git
bundle or explicit export carries the queue to a different clone; no network
write is implied by local commands. Reject the replacement if it does not
remove duplicate state and public field ceremony. The H2 choice is not a
performance or cross-machine win.

Reopen the operating ABI when a lane needs a field it cannot express, a tracker
integration rewrites the block, cross-repository work is measured, or the
production Git-ref cutover acceptance below fails. H2 selects the ref store;
do not add another live queue beside it.

### Architecture review: join work to memory without a new memory owner

The memory product decision under sh-174 precedes the task backend/cutover
decision under sh-175. The candidates below are trial designs, not a frozen
task schema or permission to build a second live store.

The queue's **Work item** owns identity, dependencies, discussion and result;
the **Claim** owns one executor turn. The outcome capsule still owns current
outcome authority, and `workflow-lessons.md` currently owns active and retired
cross-run lessons pending sh-174's retain/simplify/retire decision. This follows the existing vocabulary in `CONTEXT.md` and
ADR 0001/0005. A task may link to a capsule ID, a lesson anchor, a Git
revision or a path, but the queue does not copy their contents or verdicts.
`Compiled context` is a read view for a consumer, not a fourth memory store.

**Candidate 1 — deepen the queue module (`adopt`, sh-175).** H2 selects a
versioned task snapshot in one private Git ref under the Git common directory.
One expected-old ref update owns each transition across readiness, claim
epoch, dependencies, comments, closure and operation receipt. CLI, lane, hook,
OpenCode and state-check are callers; a public storage-adapter interface is
premature while there is one product implementation. Reject the store if a
title-only human task still needs lane fields or if claim state remains
duplicated. A human may close with actor and reason without a claim; lane
completion and recovery share the checked-candidate/operation-readback path.
The queue references the existing fixed-point proof rather than storing a
second verdict.

**Candidate 2 — compose a provisional task brief (`lab-test`, delivery-loop
consumer, conditional on sh-174).** At claim or continuation, resolve explicit context links and
show active lesson matches with their match reason and source revision. For a
lane, the pre-work match uses declared scope and is labelled provisional:
`run-ticket.sh` currently recalls from `Scope`, whereas `changes check
--strict-recall` checks the actual diff at the final fixed point. An explicit
link to a retired lesson is shown as historical/unavailable, never as an
applicable instruction. A title-only task creates no inferred lesson hit.
Baseline: show the task and run current `memory recall` manually. Reject the
brief if it adds irrelevant lessons, hides a relevant diff-triggered lesson,
or fails to change a real task decision enough to justify maintenance. The
brief cannot replace the final diff-based check or the capsule's sole writer.

The selected task store can ship without the brief. The brief remains a
separate lab-test and only earns an interface if it improves a real
claim/continuation decision over the baseline; otherwise keep explicit links
as ordinary task data and delete the extra view.

**Memory-link research disposition (2026-09-23): `lab-test`, not a new store.**
Beads currently offers [`bd remember` and `bd prime`](https://github.com/gastownhall/beads/blob/main/docs/getting-started/ide-setup.md),
while its [task-to-versioned-memory graph](https://github.com/gastownhall/beads/issues/5877)
is a proposal, not a shipped result. Its transferable question is whether a
task can cite the exact knowledge state used without copying knowledge into the
task. KRN already has Git revisions and lesson row anchors, so the first read
view can resolve an explicit reference and show current or retired state with
its source revision. This does not make the current lessons table permanent:
at source HEAD `109193e23d2ec1399b155dfc3b7283b93bf72bf1` it has 25 rows,
20 active and only four active triggers,
and `memory usage` reports one triggered row never bound to a `Recall:` trailer.
Those counters measure matching and binding, not a changed task outcome. Before
fixing a task schema to this table, classify each active row by its distinct
consumer and whether the enforcing code, test or instruction already owns its
content. Retain, simplify or retire the table on that evidence; any task link
must survive as a typed source reference with a revision, not a copy of lesson
text. A completed task may suggest a reusable lesson, but promotion follows
the then-current knowledge owner's proof and retirement rules. Do not inject
every memory body at session start: ADR 0006
retired automatic decision-point recall after its local cost and null result.
The [ContextBench study](https://arxiv.org/abs/2602.05892) found only marginal
retrieval gains from elaborate scaffolding; its benchmark does not decide this
KRN task-view question. Trial one real task where a cited lesson changes a
claim/continuation decision and one near-match or retired-lesson counterexample
against task display plus manual recall. Reject the view if it adds stale or
irrelevant guidance, fails to expose provenance, or does not improve the
decision enough to pay for its resolver and host presentation. Do not add a
durable context-use event or a new memory table until a named audit or
retirement consumer needs one.

**Cutover order and recovery.** Sh-174 has settled the knowledge-reference
boundary and H2 has selected Git-ref. Implement the production ref store with
the expected-old CAS and one shared task API. Reopen SQLite only if a supported
driver at the advertised Node floor is shown to cost less overall. Before
switching callers, import the current ID/path set with an unmapped-field
report, run capsule candidate resolution and both host queue briefs against
the imported state, and exercise delivery-loop archive/restore with a
post-import task. The H2 trial already exercised the task loop and two
linked-worktree claims using test-only adapters; it did not exercise the
production CLI. Cutover freezes writers, switches readers and writers
together, verifies each public caller, and retains the old snapshot for
rollback. The present checker requires `integrated=<sha>` for every `done`
ticket, so a new human close without a Git commit cannot be faithfully
exported into the old CLI. After new writes begin, rollback needs a reverse
export from the new store, not only a binary switch. A JSONL export alone is
data preservation, not proof that the old CLI can operate it. Reject cutover
if a post-cutover task is lost on restore or a capsule candidate goes dangling
because a reader still uses the old paths.

The 2026-09-23 independent OpenCode advisory review identified the old
`done` anchor requirement and the in-process/host reader set; the owner
verified those at `ticket-check.mjs:147-159`, `state-check.mjs:106-120`,
`config/opencode/plugins/krn.js` lines 146–153 and the delivery-loop archive
instruction. The advisory did not execute a replacement-queue falsifier.
SQLite's transaction guarantees were considered in H2; its Node floor and
driver remain costs. The H2 decision supersedes the backend candidate trial.
The conditional task brief remains a separate lab-test, not a second live
queue.
