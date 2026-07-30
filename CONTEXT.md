# Context

This is KRN's compact current model. It is an index and shared vocabulary, not
a progress log. Update meanings and links in place; Git retains their history.

## Knowledge map

- [README.md](README.md) — operator entrypoint, main workflow, and skill catalog.
- [docs/research/README.md](docs/research/README.md) — research index and curation contract.
- [docs/research/orchestration.md](docs/research/orchestration.md) — current pipeline synthesis, full graphs, and falsifiers.
- [docs/adr/0001-compact-context-spine.md](docs/adr/0001-compact-context-spine.md) — accepted memory and artifact boundary.
- [docs/capabilities.md](docs/capabilities.md) — global capability profiles and evidence states.
- [docs/migration.md](docs/migration.md) — installation ownership, retirement, and rollback.

## System vocabulary

**Global system** — the universal KRN engineering workflows versioned here and
projected into the installed skill index.

**Source repository** — this checkout. It owns skill source, installation
metadata, validation, research synthesis, and migration history.

**Installed skill index** — discoverable entries under `~/.agents/skills`.
KRN, vendor, and plugin entries may coexist; discovery does not imply ownership.

**Global instruction core** — `config/AGENTS.md`. Codex loads its installed
symlink directly; Claude reaches the same file through `CLAUDE.md`.

**Workflow owner** — the one skill responsible for a repeated procedure. Skills
may compose, but two skills may not own the same sequence.

**Semantic ABI** — the canonical nouns that connect prompt shape, skill
description, artifact fields, and routing evals. A synonym may be accepted, but
the system emits the canonical term so handoffs stay stable.

**Trigger collision** — two descriptions claim the same task without a clear
owner/companion relationship.

## Context continuity

**Compiled context** — the smallest current set needed by the next consumer:
accepted outcome, canonical language, decisions, evidence, unknowns, and links.
It excludes transcript history and copied source material.

**Outcome capsule** — a living restart record containing outcome and acceptance,
current owner and state, repository fixed point, authority, evidence and
non-proofs, open unknowns, durable references, and the next owner. It is updated
in place at owner or context boundaries.

**Working run** — private ignored state at
`.krn/runs/<workflow>/<run-id>/`. It may carry a resumable capsule, prompt,
manifest, job state, or review evidence while its goal is open. It is not a
durable report.

**Promotion gate** — working material becomes durable only when a named future
consumer, canonical semantic destination, and cleanup or supersession rule all
exist. The durable destinations are `CONTEXT.md`, `docs/adr/`,
`docs/research/`, or the configured tracker. Native Goal state remains the
current thread's continuation authority, not shared repository knowledge.

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
