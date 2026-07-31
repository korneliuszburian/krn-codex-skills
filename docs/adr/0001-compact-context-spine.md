# ADR 0001: Compact context spine

- Status: accepted
- Date: 2026-07-30
- Decision owner: KRN skill-system maintainer
- Evidence: [orchestration synthesis](../research/orchestration.md)
- Supersedes: `docs/agents/artifact-paths.json`, generic retained-report roles,
  and per-skill operator-page policy

## Context

The repository had six generic artifact roles, eight setup-generated adapter
surfaces, 18 operator pages, several overlapping research ledgers, and a narrow
review-packet skill with no caller. Most surfaces described where information
might go without naming a real consumer, invalidation rule, or deletion owner.
Long-running work still needed a reliable restart boundary.

## Decision

Use a four-part durable spine:

1. native Goal plus the configured tracker owns current outcome and queue state;
2. `CONTEXT.md` owns current shared vocabulary and the compact knowledge map;
3. `docs/adr/` owns rare consequential trade-offs;
4. `docs/research/` owns source-backed living synthesis.

Use `.krn/runs/<workflow>/<run-id>/` for private ignored workflow state. At every
owner or context boundary, condense current truth into one outcome capsule. Only
`$delivery-loop` persists and rewrites that capsule, at
`.krn/runs/delivery-loop/<outcome-id>/state.md`; other workflows return
continuation through the Goal/tracker or hand lifecycle ownership to
`$delivery-loop`. Each workflow deletes its run when the sole in-goal consumer
finishes or its owning Goal closes, whichever comes first. Cross-Goal
continuation transfers only condensed truth and pointers into the successor's
own run before deletion.

Promotion from a run requires all three:

- a named future consumer;
- one semantic canonical destination;
- a cleanup or supersession rule.

The README is the sole human skill catalog and links directly to canonical
`SKILL.md` files. Skills own procedures; no per-skill operator mirror is
required. `reviewer-handoff` is retired until a real bridge proves a distinct
consumer.

## Consequences

- Repository knowledge becomes smaller, indexed, and continuously rewritten.
- Git history replaces a separate append-only knowledge log.
- Review packets, prompts, shards, and progress files stay out of tracked docs.
- Setup creates one managed instruction block and one ignored run boundary.
- Durable paths are fixed by meaning rather than configured generic roles.
- A fresh session can resume from the capsule plus repository/tracker state.
- Existing ignored review passes must be closed and explicitly removed; they
  are not promoted merely because they already exist.

## Rejected alternatives

- Keep the role registry with fewer keys: still adds indirection for one live
  value and leaves lifecycle semantics elsewhere.
- Store every run in the tracker: prompts, private packets, and job transport do
  not belong in durable issue state.
- Add a memory database or skill: no measured scale or retrieval failure earns
  the extra owner.
- Use system temp for all state: it is suitable for disposable transport but
  not a multi-session run that must survive process restarts.

## Supersession rule

Replace this ADR only when measured restart, retrieval, routing, or concurrent
ownership failures cannot be fixed within the four semantic owners. A successor
must migrate active consumers and name who removes the old state.
