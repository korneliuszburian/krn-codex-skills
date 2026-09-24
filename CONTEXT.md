# Context

This is KRN's compact current model. It is an index and shared vocabulary, not
a progress log. Update meanings and links in place; Git retains their history.

## Knowledge map

- [README.md](README.md) — operator entrypoint, main workflow, and skill catalog.
- [docs/research/README.md](docs/research/README.md) — research index and curation contract.
- [docs/research/orchestration.md](docs/research/orchestration.md) — current lifecycle spine, admission map, retrieval ladder, and falsifiers.
- [docs/research/self-hardening-roadmap.md](docs/research/self-hardening-roadmap.md) — bounded research and delivery dependencies; ticket status stays in the configured queue.
- [docs/research/lab-tests.md](docs/research/lab-tests.md) — the LT lab-test registry through LT-107, protocols, and residuals.
- [docs/adr/0001-compact-context-spine.md](docs/adr/0001-compact-context-spine.md) — accepted memory and artifact boundary.
- [docs/adr/0002-lifecycle-transition-table.md](docs/adr/0002-lifecycle-transition-table.md) — accepted condition → handler → return transition table.
- [docs/adr/0003-finite-release-decision.md](docs/adr/0003-finite-release-decision.md) — accepted completion rule: a finite release decision ends an outcome; its default-stop is superseded by ADR 0005.
- [docs/adr/0004-queue-legibility-and-memory-delivery.md](docs/adr/0004-queue-legibility-and-memory-delivery.md) — accepted plan for queue legibility, memory delivery, and lane-loop automation after the 2026-09-18 arc.
- [docs/adr/0005-continuous-hardening-with-bounded-passes.md](docs/adr/0005-continuous-hardening-with-bounded-passes.md) — accepted posture: continuous hardening in bounded, triggered passes; first batch is the verified pipeline holes sh-60..sh-65.
- [docs/adr/0006-keep-the-krn-surfaces.md](docs/adr/0006-keep-the-krn-surfaces.md) — accepted decision: keep the KRN surfaces as the default with the measured cost recorded, and reopen on a discriminative benchmark or an operator scope change.
- [docs/research/workflow-lessons.md](docs/research/workflow-lessons.md) — bounded cross-run workflow memory consumed by recall and changes check; agent-facing delivery remains retired.
- The Matt Pocock skills audit and the unslop lab-test page are indexed under [docs/research/README.md](docs/research/README.md).
- [scripts/quality-audit.mjs](scripts/quality-audit.mjs) — mechanical slop, dead-code, and credential/env-dump audit gated in `npm run test:lib`.
- [config/conformance.json](config/conformance.json) — frozen public-seam acceptance cases run by `krn conformance check`; CI runs the base ref's copy against the candidate.
- [docs/capabilities.md](docs/capabilities.md) — global capability profiles and evidence states.
- [docs/migration.md](docs/migration.md) — installation ownership, retirement, and rollback.
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

**Repository memory** — information preserved for later work. Continuation
state serves one active outcome; reusable knowledge can serve later outcomes.
A work item's status, comments and history remain work records until a named
knowledge owner deliberately promotes a reusable conclusion.

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

**Work item** — one unit of planned work in the configured queue, with an
identity, dependencies, discussion, and a result. It does not replace the
current session's Goal or the outcome capsule.

**Claim** — an exclusive assignment of a work item to one executor. It gives
the executor a turn at the item, not authority to commit, publish, install, or
change another repository.

**Lane recipe** — optional implementation constraints and a deciding proof for
a work item assigned to an automated lane. Ordinary work items need no recipe.

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
