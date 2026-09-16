# Ticket protocol

Status: `accepted`. Consumer: the maintainer, the lane runner, and any worker or
integrator session. Owner: maintainer. Verified: 2026-09-16.

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
- Publication: one PR per iteration and adjacent tickets batch into one PR; a
  PR whose diff changes exported skill bytes merges with a merge commit so the
  export marker commit stays in history, while code-only iterations may squash
  into a single conventional commit.
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

Reopen when a lane needs a field the ABI cannot express, a tracker integration
rewrites the block, or cross-repository work is measured.
