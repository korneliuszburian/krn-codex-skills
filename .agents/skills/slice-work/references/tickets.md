# Publishing slices as tickets

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

## One ticket shape: the ABI

Published tickets use the [ticket ABI v1](../../../../docs/research/ticket-protocol.md),
not a skill-local template. Emit one `<krn-ticket>` envelope per unit and let the
ABI own the fields; `scripts/lib/ticket/ticket.mjs` and `krn-codex ticket check`
parse and reject any other field set, so a parallel shape reads as `missing-field`.

Carry the unit's decision evidence into the envelope:

- `Id`, `Title`, `Status`, `Type`, `Repository-base`, `Scope`, `Deciding check`,
  `Contract`, `Acceptance`, and `Blocked by` are the required fields.
- A new unpublished unit starts at `Status: ready`; `Blocked by` names the ids
  that gate it, or `none`.
- `Execution` records the agent, model, effort, and parallel group so the runner
  needs no environment plumbing.
- The prose below the block stays human-facing: the end-to-end behaviour, the
  dependency reason, and acceptance detail.

Do not write a `Kind:`/`ready-for-agent` block or any other competing ticket
shape; the ABI in [ticket-protocol.md](../../../../docs/research/ticket-protocol.md)
is the single owner of the envelope.

## How blocking edges are expressed

The slices are the same either way; only the shape of the blocking edges changes.

- **Configured local-markdown tracker** → use the exact root declared by the
  closest repository instructions, one file per ticket, numbered in dependency order
  (blockers first). Each ticket's `Blocked by` lists the ids it depends on.
  One ticket per file, never a combined backlog file.
- **A real tracker (Beads, GitHub, GitLab, …)** → publish one issue per ticket in
  dependency order so each ticket's edges can reference real identifiers. Use the
  platform's **native** dependency / blocking relationship where it has one (it renders
  the frontier visually); otherwise set each ticket's `Blocked by` to the blocking
  issues. Mark each agent-ready unless instructed otherwise — the tickets are
  agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a linear chain
that is top to bottom. Do not close or modify any parent issue.

Avoid specific file paths or code snippets — they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state machine,
reducer, schema, type shape) may be inlined briefly with a note that it came from a
prototype.

## Expand–migrate–contract stages

Use migration stages when an existing compatibility boundary or wide mechanical
blast radius means no direct vertical slice can land safely. Do not use them merely
because a diff is large. Sequence the transition as **expand–migrate–contract**:

1. **Expand** — add the new form beside the old so nothing breaks.
2. **Migrate** — move the call sites over in batches sized by blast radius (per
   package, per directory), each batch its own ticket blocked by the expand, keeping
   CI green batch to batch because the old form still exists.
3. **Contract** — delete the old form once no caller remains, in a ticket blocked by
   every migrate batch.

Each stage states its entry invariant, exit invariant, falsifier, and rollback or
compatibility boundary. When even migrate batches cannot stay green alone, keep the
sequence but let them share an explicitly authorized integration branch that all
block a final integrate-and-verify ticket; green is promised only there. These
stages earn their non-vertical shape by making every intermediate state explicit and
safe, not by delivering user behavior on their own.
