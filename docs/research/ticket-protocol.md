# Ticket protocol

Status: `accepted`. Consumer: the maintainer, the lane runner, and any worker or
integrator session. Owner: maintainer. Verified: 2026-09-23.

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

SQLite is the preferred **engine to trial**, in one database under the resolved
Git common directory so linked worktrees share task state without a daemon or
per-ticket lock. Its [write transactions](https://www.sqlite.org/lang_transaction.html)
serialize claims. Start the correctness trial with SQLite's default rollback
journal; [WAL](https://www.sqlite.org/wal.html) needs a demonstrated concurrency
benefit and a verified SQLite library version with the WAL-reset fix before it
enters the design. This is a storage choice, not a decision to
require a database service. The driver is still a release gate: KRN advertises
Node `>=22`, while the built-in module at pinned Node 22.11 is
[experimental and flag-gated](https://nodejs.org/download/release/v22.11.0/docs/api/sqlite.html).
Either a supported pinned driver or an explicit Node-floor change must earn its
install cost. A database in the Git common directory does **not** sync between
separate clones; export/import remains explicit until a real sync consumer is
established.

The lighter storage countercandidate is one private Git ref,
`refs/krn/queue`, with a versioned snapshot and old-object compare-and-swap.
Git [shares ordinary refs across linked worktrees](https://git-scm.com/docs/git-worktree)
and [checks the expected old object](https://git-scm.com/docs/git-update-ref).
A disposable 2026-09-23 two-worktree race from the same absent ref returned one
successful update, one rejected update, and identical readback. That proves
only the Git primitive; indexing, ambiguous retry, growth, backup and import
remain untested. Reject the ref adapter if it needs more custom queue/storage
code than SQLite saves in installation cost. A repaired file baseline is also
live: place one canonical task set under Git common dir, use one short mutation
mutex, and keep claim plus history in the same owned record. Reject SQLite if
that complete operator flow and crash recovery are simpler to maintain without
the driver, schema and migration costs. Beads uses
[embedded or server Dolt](https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md)
for versioned history and cross-clone sync; KRN should pay that cost only if
those become required here.

### H2 backend decision (2026-09-24, sh-175)

**Disposition: adopt the private Git-ref snapshot as the canonical backend for
the local task product.** The owner is the sh-175 maintainer; consumers are the
existing ticket CLI, lane, state, hook and OpenCode readers. Keep the Markdown
queue live until the lossless import, all-reader switch, rollback and restore
checks pass. This decision selects the implementation direction; it does not
authorize cutover or retirement by itself.

**Evidence and rationale.** The H2 test-only comparison passed the same task,
claim, completion and recovery falsifiers for the single JSON file, Git-ref and
SQLite candidates on Node 26.2.0 and 22.14.0. The Git candidate uses Git's
expected-old ref update to perform compare-and-swap, and KRN already requires
Git for its core operations. That avoids adding a runtime library or a custom
claim-lock recovery protocol. The file candidate passed the listed fault
points, but the comparison did not measure a lower lifecycle, backup or
recovery cost for it. The SQLite candidate passed on Node 22.14.0 with an
experimental warning. Built-in `node:sqlite` was added in v22.5, is
flag-gated and active development in the pinned v22.11 docs, and remains
active development without the flag in v22.14. KRN advertises Node `>=22`, so
the built-in module does not cover the full supported range without a floor
change; an alternate driver would add an unmeasured install cost. The exact
sources are [Node.js v22.11 SQLite](https://nodejs.org/download/release/v22.11.0/docs/api/sqlite.html),
[Node.js v22.14 SQLite](https://nodejs.org/download/release/v22.14.0/docs/api/sqlite.html),
and [Git `update-ref`](https://git-scm.com/docs/git-update-ref).

**Falsifier and non-proof.** Reopen this selection before cutover if the
production Git-ref path cannot preserve the current ticket path/ID set and
unmapped fields, if linked-worktree contention, operation fencing or
effect-readback fails in the public CLI, or if backup/restore/rollback costs
more than the repaired-file baseline. Reconsider SQLite only if its supported
driver and minimum-runtime cost are established at the advertised floor. The
H2 adapters are test-only; they do not prove production import, rollback,
installation cost, performance or cross-clone synchronization. No current
queue data has been imported by this decision.

The smallest product falsifier is two linked worktrees claiming the same ready
ID: exactly one may succeed, and a reopened queue must have one claim and no
sidecar lock. The Git-ref primitive race above does not satisfy this product
falsifier. Also verify `add → claim → comment → close →
reopen`, crash before/after the ref update, duplicate retry after an ambiguous
response, blocker cycles, and a lossless import of the current path/ID set.
The import first reports unmapped fields and keeps old files read-only;
cutover changes readers and writers together; deletion of `.scratch` tickets,
`.krn/claims`, the old parser/reconcile code, and stale instructions follows
only after readback and rollback export. A Git bundle or explicit export carries
the queue to a different clone; no network write is implied by local commands.
Reject the replacement if it does not remove duplicate state and public field
ceremony. Compare SQLite, the Git-ref countercandidate, and the unchanged queue
on actual code, install, import and recovery cost; reject SQLite if its driver
or distribution burden outweighs the repaired file baseline. This trial
does not claim a performance or cross-machine win.

Reopen the operating ABI when a lane needs a field it cannot express, a tracker
integration rewrites the block, cross-repository work is measured, or the
replacement trial passes its cutover checks. The replacement candidate is
superseded by the trial result, not by adding another live queue beside it.

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

**Candidate 1 — deepen the queue module (`lab-test`, sh-175).** Its small
interface should make one transaction responsible for readiness, claim epoch,
dependencies, comments and closure. CLI, lane, hook, OpenCode and state-check
are callers; a public storage-adapter interface is premature while there is
one product implementation. Compare a complete SQLite task loop with the
unchanged file queue and the private Git-ref candidate, including driver,
installation, import, recovery and code that can be deleted. Reject the
replacement if a title-only human task still needs lane fields or if claim
state remains duplicated. A human may close with actor and reason without a
claim; a lane close needs the current claim epoch and the existing fixed-point
proof. The queue must reference that proof rather than store another verdict.

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

The two candidates solve different problems. The queue trial can succeed
without the brief. The brief only earns a separate interface if it improves a
real claim/continuation decision over the baseline; otherwise keep explicit
links as ordinary task data and delete the extra view.

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

**Cutover order and recovery.** After sh-174 decides the knowledge-reference
contract or explicitly chooses no link, settle a supported Node `>=22` SQLite
driver or change the advertised floor after a lowest-version smoke. Trial the
daily task loop and two linked-worktree claims in a disposable store. Then
import the current ID/path set with an unmapped-field report, run capsule
candidate resolution and both host queue briefs against it, and exercise the
delivery-loop archive/restore with a post-import task. Switch readers and
writers together; only then remove old tickets, claim sidecars and parser.
The present checker requires `integrated=<sha>` for every `done` ticket, so a
new human close without a Git commit cannot be faithfully exported into the
old CLI. Before cutover, rollback means restoring the preserved old snapshot;
after cutover, recovery needs the new store plus an explicit export. A JSONL
export alone is data preservation, not proof that the old CLI can operate it.
Reject cutover if a post-cutover task is lost on restore or a capsule candidate
goes dangling merely because a reader still uses the old paths.

The 2026-09-23 independent OpenCode advisory review identified the old
`done` anchor requirement and the in-process/host reader set; the owner
verified those at `ticket-check.mjs:147-159`, `state-check.mjs:106-120`,
`config/opencode/plugins/krn.js` lines 146–153 and the delivery-loop archive
instruction. The advisory did not execute a replacement-queue falsifier.
SQLite's transaction guarantees support a local trial; its
[documented WAL-reset version boundary](https://www.sqlite.org/wal.html) and KRN's
Node floor remain costs. Supersede these candidates with the measured sh-170
trial result, not with a second live queue.
