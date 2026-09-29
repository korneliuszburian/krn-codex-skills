# Publishing slices as work items

`$slice-work` always returns the complete work-unit list. Ticket publication is a
separate mutation: perform it only when the request supplies publication authority
and the closest repository `AGENTS.md` or other closest instructions already name
the tracker destination and dependency operations. Those instructions describe how
to publish; they do not grant authority.

If publication was requested but either requirement is missing, return ticket-
publication state `PUBLISH_PENDING` with that exact missing condition. Do not initialize a tracker or
invent a local path. Publishing **creates** one ticket per work unit and its blocking
edges; it never claims, sequences, or owns lifecycle. The configured tracker
stores queue and claim state; the next outcome owner performs any later claim
through its declared operation and separate authority. `$delivery-loop` selects
the next unit and owns lifecycle coordination only when its envelope is active.

## Selected Git-ref task queue

When the closest instructions select KRN's Git-ref queue, require its active
selector before publication. An absent selector may mean selector loss: stop,
not a fallback to Markdown. Create blockers first with `krn task add --root
REPO --id ID --title TITLE --body BODY` and repeat `--depends-on BLOCKER`
for already-created dependencies. Preserve each unit's repository base,
scope, deciding check, contract, acceptance, and decision evidence in the task
body; these are not separate public task fields or a `<krn-ticket>` envelope.

New tasks are `open`. Blocked tasks remain open: `krn task ready --root REPO
--id ID` succeeds only after all dependencies are `done`. Do not make blocked
work ready merely to publish a plan. Read back each identity, body, and blocking
edge with `krn task show --root REPO --id ID`, then run `krn task check --root
REPO` for queue consistency. The check reads selected task records, not Markdown
files; it cannot prove that an unpublished ticket envelope was transferred.
`$slice-work` creates and reads back units but never claims or sequences them.

## Externally configured Markdown tracker

Only a separate tracker expressly configured by the closest instructions may
publish local Markdown, using that tracker's declared validator and dependency
operations. KRN's old `.krn/tickets/` files are historical input to
`krn task store migrate --root REPO`, not a runnable second queue or a reason
to fall back when the Git-ref selector is missing. For a separately configured
Markdown tracker, use its declared root and publish blockers first, one work
item per file.

The [ticket ABI v1](../../../../docs/research/ticket-protocol.md) remains a
historical import format: `<krn-ticket>` envelopes are parsed by
`scripts/lib/ticket/ticket.mjs` while migrating old KRN records. That parser
is not another public CLI. Where an external tracker independently requires
this format, its owner validates the required fields and decision evidence:

- `Id`, `Title`, `Status`, `Type`, `Repository-base`, `Scope`, `Deciding check`,
  `Contract`, `Acceptance`, and `Blocked by` are required.
- A new unpublished file starts at `Status: ready`, even with blockers;
  `Blocked by` names their ids or `none`.
- `Execution` records agent, model, effort, and parallel group for the runner.
- Prose below the block explains the behavior, dependency reason, and acceptance.

Do not invent a `Kind:`/`ready-for-agent` block or a KRN Markdown queue.
Read back each externally configured work item and its blocking edges.

## Real tracker

For Beads, GitHub, GitLab, or another configured tracker, publish one issue
per unit in dependency order so edges reference real identifiers. Use native
blocking relationships where available; otherwise set each issue's `Blocked by`
to its blocking issues. Mark agent-ready unless instructed otherwise.

The next outcome owner works the **frontier** of unblocked units; `$slice-work`
never claims a unit, closes a parent issue, or owns the execution order.

Avoid specific file paths or code snippets; they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state machine,
reducer, schema, type shape) may be inlined briefly with a note that it came from a
prototype.

## Expand–migrate–contract stages

Use migration stages when an existing compatibility boundary or wide mechanical
blast radius means no direct vertical slice can land safely. Do not use them merely
because a diff is large. Sequence the transition as **expand–migrate–contract**:

1. **Expand**; add the new form beside the old so nothing breaks.
2. **Migrate**; move the call sites over in batches sized by blast radius (per
   package, per directory), each batch its own ticket blocked by the expand, keeping
   CI green batch to batch because the old form still exists.
3. **Contract**; delete the old form once no caller remains, in a ticket blocked by
   every migrate batch.

Each stage states its entry invariant, exit invariant, falsifier, and rollback or
compatibility boundary. When even migrate batches cannot stay green alone, keep the
sequence but let them share an explicitly authorized integration branch that all
block a final integrate-and-verify ticket; green is promised only there. These
stages earn their non-vertical shape by making every intermediate state explicit and
safe, not by delivering user behavior on their own.
