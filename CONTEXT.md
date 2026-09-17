# Context

This is KRN's compact current model. It is an index and shared vocabulary, not
a progress log. Update meanings and links in place; Git retains their history.

## Knowledge map

- [README.md](README.md) — operator entrypoint, main workflow, and skill catalog.
- [docs/research/README.md](docs/research/README.md) — research index and curation contract.
- [docs/research/orchestration.md](docs/research/orchestration.md) — current lifecycle spine, admission map, retrieval ladder, and falsifiers.
- [docs/research/lab-tests.md](docs/research/lab-tests.md) — registered LT-1..LT-7 lab-test claims, protocols, and residuals.
- [docs/adr/0001-compact-context-spine.md](docs/adr/0001-compact-context-spine.md) — accepted memory and artifact boundary.
- [docs/adr/0002-lifecycle-transition-table.md](docs/adr/0002-lifecycle-transition-table.md) — accepted condition → handler → return transition table.
- [docs/adr/0003-finite-release-decision.md](docs/adr/0003-finite-release-decision.md) — accepted stop rule: a finite release decision replaces the open-ended bug hunt.
- [docs/research/workflow-lessons.md](docs/research/workflow-lessons.md) — bounded cross-run workflow memory read at `$delivery-loop` bind.
- The Matt Pocock skills audit and the unslop lab-test page are indexed under [docs/research/README.md](docs/research/README.md).
- [scripts/quality-audit.mjs](scripts/quality-audit.mjs) — mechanical slop, dead-code, and credential/env-dump audit gated in `npm run test:lib`.
- [config/conformance.json](config/conformance.json) — frozen public-seam acceptance cases run by `krn-codex conformance check`; CI runs the base ref's copy against the candidate.
- [docs/capabilities.md](docs/capabilities.md) — global capability profiles and evidence states.
- [docs/migration.md](docs/migration.md) — installation ownership, retirement, and rollback.
- [skills/frontend/frontend-stage/SKILL.md](skills/frontend/frontend-stage/SKILL.md) — frontend stage entry: intake → architecture → build → verify, with exit criteria and a per-section acceptance.
- [skills/meta/unslop/SKILL.md](skills/meta/unslop/SKILL.md) — explicit prose audit/rewrite with protected factual and technical fragments; it does not own publication or fact-checking.

## System vocabulary

**Global system** — the universal KRN engineering workflows versioned here and
projected into the installed skill index.

**Composed upstream set** — the pinned `mattpocock/skills` checkout named by
`config/upstream-sources.json`. This repository references those owners by name
and owns none of their procedure; the lock is the source of truth and the
always-loaded ownership boundary lives in `config/AGENTS.md`.

**Source repository** — this checkout. It owns skill source, installation
metadata, validation, research synthesis, and migration history.

**Installed skill index** — discoverable entries under `~/.agents/skills`.
KRN, vendor, and plugin entries may coexist; discovery does not imply ownership.

**Global instruction core** — `config/AGENTS.md`. Codex loads its installed
snapshot directly.

**Workflow owner** — the one skill responsible for a repeated procedure. Skills
may compose, but two skills may not own the same sequence.

**Transition table** — the canonical condition → handler → return contract owned
by `$delivery-loop`; the repository-scoped harness baseline is derived from its
handler column and validated against the manifest and pin.

**Current uncertainty** — the one unresolved condition that selects the next
workflow owner. Settled phases are skipped; there is no mandatory full pipeline.

**Lifecycle envelope** — `$delivery-loop` ownership of outcome state, the sole
writer, handoffs, and authorized transitions around specialist owners. It does
not absorb their procedures.

**Semantic ABI** — the canonical nouns that connect prompt shape, skill
description, artifact fields, and routing language. A synonym may be accepted, but
the system emits the canonical term so handoffs stay stable.

**Trigger collision** — two descriptions claim the same task without a clear
owner/companion relationship.

**Project adapter** — local domain and runtime constraints that connect a
global workflow owner to one repository without becoming global doctrine.
_Avoid_: global project standard, universal stack

## Context continuity

**Compiled context** — the smallest current set needed by the next consumer:
accepted outcome, canonical language, decisions, evidence, unknowns, and links.
It excludes transcript history and copied source material.

**Outcome capsule** — the living restart record for one accepted outcome,
rewritten in place at owner or context boundaries. Its path, sole writer, and
reader commands are owned by `config/AGENTS.md`; `$delivery-loop` owns its field
ABI and lifecycle, and other artifacts link to it instead of restating its
fields.

**Working run** — private ignored state at
`.krn/runs/<workflow>/<run-id>/`. It may carry that workflow's prompt, manifest,
transient spec or slice list, job state, or review evidence while its goal is
open. Only the outcome capsule's sole writer named in `config/AGENTS.md` may
persist it. A run is not a durable report;
its owner deletes it when the sole in-goal consumer finishes or the owning Goal
closes, whichever comes first. Cross-Goal continuation first transfers only
condensed truth and pointers into the successor's own run. For a superseded or
abandoned delivery run, an active Goal remains its consumer until the available
cancellation, deferral, or other non-active transition is read back; transfer
alone is not consumer completion.

**Promotion gate** — working material becomes durable only when a named future
consumer, canonical semantic destination, and cleanup or supersession rule all
exist. The durable destinations are `CONTEXT.md`, `docs/adr/`,
`docs/research/`, or a configured tracker when present. Native Goal state remains
the current thread's continuation authority, not shared repository knowledge.

## Engineering vocabulary

**Vertical slice** — the smallest route from a real caller through a public seam
to an observable result.

**Public seam** — the interface where callers and proof observe behavior. It is
chosen for the product, not created only to make a test easy.

**Proof budget** — `0/1/N` new falsifiers justified by changed risk.

**Tight loop** — the fastest repeatable signal that can disagree with the claim
or reproduce the fault.

**Proof theater** — evidence that cannot falsify the claim: implementation-
coupled tests, prose snapshots, file counts, tautologies, or CI treated as the
delivered behavior.

**Fixed point** — base revision, head revision or working-tree fingerprint,
Spec revision, and Standards revision reviewed as one identity. Any change
invalidates the old review result.

**Publication** — commit, push, pull request, merge, deployment, or installation.
Publication state is reported separately from semantic completion.

## Source vocabulary

**Mechanism** — a transferable causal rule distilled from a source.

**Decision** — `adopt`, `reject`, `lab-test`, or `defer` for a named consumer
and falsifier. Sources support decisions; they do not override local evidence.
