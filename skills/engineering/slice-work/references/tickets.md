# Publishing slices as tickets

`slice-work` always emits the slice list. When the repository has a configured
tracker (`docs/agents/issue-tracker.md`), it also publishes each slice as one
ticket with its **blocking edges** so `$delivery-loop` can claim and work them. This
is the to-tickets step: it **creates** ticket items; it never claims, sequences, or
owns lifecycle — that stays with `$delivery-loop`.

Read `docs/agents/issue-tracker.md` for how this repository expresses issues and
dependencies. If no tracker is configured, the slice list itself is the artifact;
do not run `$setup-repository-workflow` unprompted.

## How blocking edges are expressed

The slices are the same either way; only the shape of the blocking edges changes.

- **Local-markdown tracker** → one file per ticket under
  `.scratch/<feature>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order
  (blockers first). Each file's **Blocked by** lists the numbers/titles it depends on.
  One ticket per file, never a combined backlog file.
- **A real tracker (Beads, GitHub, GitLab, …)** → publish one issue per ticket in
  dependency order so each ticket's edges can reference real identifiers. Use the
  platform's **native** dependency / blocking relationship where it has one (it renders
  the frontier visually); otherwise set each ticket's **Blocked by** to the blocking
  issues. Mark each agent-ready unless instructed otherwise — the tickets are
  agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a linear chain
that is top to bottom. Do not close or modify any parent issue.

Avoid specific file paths or code snippets — they go stale fast. Exception: a
prototype snippet that encodes a decision more precisely than prose (state machine,
reducer, schema, type shape) may be inlined briefly with a note that it came from a
prototype.

<local-ticket-template>
# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's
perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or
"None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
</local-ticket-template>

<tracker-ticket-template>
## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not
layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".
</tracker-ticket-template>

## Wide refactors are the exception to vertical slicing

A **wide refactor** is one mechanical change — rename a column, retype a shared
symbol — whose **blast radius** fans across the whole codebase, so a single edit
breaks thousands of call sites at once and no vertical slice can land green. Do not
force it into a tracer bullet; sequence it as **expand–contract**:

1. **Expand** — add the new form beside the old so nothing breaks.
2. **Migrate** — move the call sites over in batches sized by blast radius (per
   package, per directory), each batch its own ticket blocked by the expand, keeping
   CI green batch to batch because the old form still exists.
3. **Contract** — delete the old form once no caller remains, in a ticket blocked by
   every migrate batch.

When even the batches cannot stay green alone, keep the sequence but let them share
an integration branch that all block a final integrate-and-verify ticket — green is
promised only there. This is the one case where a slice is not a vertical path, and
it earns its place by keeping the build green, not by delivering a behaviour on its own.
