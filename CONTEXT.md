# Context

This is KRN's compact current model. It is an index and shared vocabulary, not
a progress log. Update meanings and links in place; Git retains their history.

## Knowledge map

- [README.md](README.md) — operator entrypoint, main workflow, and skill catalog.
- [docs/research/README.md](docs/research/README.md) — research index and curation contract.
- [docs/research/orchestration.md](docs/research/orchestration.md) — current lifecycle spine, admission matrix, and falsifiers.
- [docs/research/skills-3arm-lab.md](docs/research/skills-3arm-lab.md) — three-arm skills lab spec and verdict: no measured advantage of forked skills over upstream or no-skill; the shared set composes upstream.
- [docs/adr/0001-compact-context-spine.md](docs/adr/0001-compact-context-spine.md) — accepted memory and artifact boundary.
- [docs/capabilities.md](docs/capabilities.md) — global capability profiles and evidence states.
- [docs/migration.md](docs/migration.md) — installation ownership, retirement, and rollback.
- [evals/README.md](evals/README.md) — Git-native experiment lifecycle, reviewer fixed points, and artifact integrity.
- [skills/meta/unlazy/SKILL.md](skills/meta/unlazy/SKILL.md) — explicit completion ledger with approved checks and re-verification; it does not own lifecycle state or sandbox commands.

## System vocabulary

**Global system** — the universal KRN engineering workflows versioned here and
projected into the installed skill index.

**Composed upstream set** — the shared engineering flow (`wayfinder`,
`to-spec`, `implement`, `diagnosing-bugs`, `prototype`, `codebase-design`,
`code-review`, `domain-modeling`, `tdd`, `triage`, `wizard`, `grilling`,
`handoff`) installed from `mattpocock/skills` (`npx skills add` or the Claude
Code plugin). This checkout references them by name and owns none of their
procedure; the three-arm lab found no advantage of a hand-forked copy over
upstream or over no skill.

**Source repository** — this checkout. It owns skill source, installation
metadata, validation, research synthesis, and migration history.

**Installed skill index** — discoverable entries under `~/.agents/skills`.
KRN, vendor, and plugin entries may coexist; discovery does not imply ownership.

**Global instruction core** — `config/AGENTS.md`. Codex loads its installed
symlink directly; Claude reaches the same file through `CLAUDE.md`.

**Workflow owner** — the one skill responsible for a repeated procedure. Skills
may compose, but two skills may not own the same sequence.

**Current uncertainty** — the one unresolved condition that selects the next
workflow owner. Settled phases are skipped; there is no mandatory full pipeline.

**Lifecycle envelope** — `$delivery-loop` ownership of outcome state, the sole
writer, handoffs, and authorized transitions around specialist owners. It does
not absorb their procedures.

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
sole writer, separate outcome and publication states, repository fixed point and
dirty scope, Goal and optional configured-tracker identity, restart-run identity,
outstanding cleanup obligations for specialist runs, separate authorities,
evidence and non-proofs, review disposition, owned unknowns, durable references,
and the next owner. It is updated in place at owner or context boundaries;
`$delivery-loop` owns its
exact field ABI.

**Working run** — private ignored state at
`.krn/runs/<workflow>/<run-id>/`. It may carry that workflow's prompt, manifest,
transient spec or slice list, job state, or review evidence while its goal is
open. Only `$delivery-loop` may persist the outcome capsule, at
`.krn/runs/delivery-loop/<outcome-id>/state.md`. A run is not a durable report;
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

**Experiment record** — one Git-tracked `evals/experiments/<id>/` directory
whose manifest binds protocol, admissible evidence, grading, decision, review
fixed points, hashes, omissions, and epistemic status.

**Experiment seal** — the deterministic artifact inventory and content-safety
gate. It writes hashes and byte counts; it does not decide quality or authorize
a lifecycle transition.

**Capsule-only experiment** — a terminal historical or external-evidence
record with explicit omissions and exploratory epistemic status; never a full
archive or confirmatory result.

**Completion ledger** — an optional `.krn/runs/unlazy/<run-id>/GATES.md` record
of observable gates, command evidence, and manual blockers. `$unlazy` owns the
ledger mechanics; `$delivery-loop` still owns lifecycle state and publication.
