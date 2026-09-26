---
name: delivery-loop
description: Coordinate one accepted outcome whose success is agreed through composed owners, fixed-point review, and authorized publication state. Use for autonomous end-to-end lifecycle ownership; skip a single scoped edit, diagnosis-only work, or review-only work.
---

# Delivery Loop

Keep one accepted outcome moving while the specialized skills retain their own
procedures. This is a thin, goal-aware composer: it owns lifecycle truth,
writer ownership, handoffs, and selection and readback of authorized
transitions. Specialist skills own stage procedures; configured trackers and
hosts own their mechanics and policy.

1. **Bind one outcome and one writer.** When the configured tracker is a
   queue, read its frontier with `krn ticket check` and `krn ticket next`,
   select one ready item, and record `krn ticket claim` before any
   implementation; keep the frontier and item state in the capsule. Read the
   closest repository instructions, current Git state, configured tracker item
   when one exists, active native goal when one exists, and
   `docs/research/workflow-lessons.md` when it exists as the cross-run workflow
   memory. Create a native goal only when the user explicitly requested
   persistent autonomous progress; otherwise
   the accepted request is the outcome authority. Reconcile a pre-existing goal
   with repository and tracker truth before continuing.

   Keep exactly one compact working record and replace its fields in place:

   <outcome-capsule>
   Outcome and observable acceptance:
   Current workflow owner and sole writer:
   Outcome state: ACTIVE | BLOCKED | DEFERRED | NEEDS_REVIEW | COMPLETE | SUPERSEDED | ABANDONED
   Publication state: NOT_REQUESTED | NOT_AUTHORIZED | LOCAL_ONLY | PUBLISH_PENDING | PR_OPEN | MERGE_READY | MERGED | DEPLOYED
   Repository base, HEAD or working-tree fingerprint, and dirty-state scope:
   Native Goal identity/state and configured tracker item/state:
   Restart state: ABSENT | <semantic path owned by the current Goal>
   Outstanding workflow-run cleanup: none | [<semantic pointer; workflow; sole consumer; trigger; ACTIVE | CLEANUP_PENDING | BLOCKED>, ...]
   Authority: writes=; tracker/issue=; commit=; push=; PR=; merge=; deployment/install=
   Evidence observed:
   Explicit non-proofs:
   Review fixed point and Standards / Spec disposition:
   Open unknowns and blockers with owners:
   Workflow friction and lesson candidates: none | [<observed friction; evidence; candidate gate, instruction edit, or bounded lab-test>, ...]
   Durable CONTEXT / ADR / research references:
   Next bounded owner and action:
   </outcome-capsule>

   Keep each narrative field within its byte bound: `Evidence observed` ≤ 4096,
   `Next bounded owner and action` ≤ 2048, `Open unknowns and blockers with
   owners` ≤ 2048, and `Review fixed point and Standards / Spec disposition`
   ≤ 2048, with the four together ≤ 8192 UTF-8 bytes. `krn state check` fails
   `capsule-narrative-over-budget` past any bound. The capsule is a working
   record, so history belongs in the LT registry at `docs/research/lab-tests.md`,
   not in the capsule.

   Exactly one agent or session may mutate tracked files, the outcome branch,
   tracker state, or goal state at a time. This is a cooperative coordination
   invariant, not process isolation or a security boundary. Transfer that writer role explicitly
   before a mutating handoff. Parallel work is read-only, pinned to an immutable
   repository or artifact identity, and returns its evidence to the named sole
   writer or integrator for disposition and capsule update. It may not claim
   work, edit, publish, or declare the outcome done.

   **Done when:** one outcome, one writer, one active implementation item at
   most, explicit observable acceptance, and evidence, non-proofs, unknowns,
   durable pointers, fingerprints, and separate authority states.

2. **Route only the current uncertainty.** Select the smallest handler for the
   one unresolved condition in [references/transitions.md](references/transitions.md).
   That table is the canonical routing contract and the definition of the
   harness baseline. Compose the handler and stop at its return boundary; do not
   copy a composed skill's procedure into this contract, and do not manufacture
   a stage. A decomposed spec gives `$slice-work` units whose deciding check is named first.

   **Done when:** the current owner receives bounded acceptance, an explicit
   mutation-authority state (including none), relevant paths, and the evidence
   it must return.

3. **Refresh the capsule at every context boundary.** Before and after a
   delegated context, fresh session, interruption, implementation, proof,
   review, commit, push, or CI transition, re-read HEAD, status, tracker, goal,
   and host state. Replace the capsule rather than appending a narrative status
   trail.

   For mechanical, documentation, or topology-only 0-budget work, reconcile
   only the capsule axes that changed; do not rewrite the whole capsule at
   every boundary.

   When a later session must resume the outcome, the writer may store only the
   capsule and pointers to its authorities at
   `.krn/runs/delivery-loop/<outcome-id>/state.md`, but only after verifying
   `.krn/runs/` is ignored by Git. This optional restart state is owned and
   consumed by `$delivery-loop`; it contains no copied diffs, raw logs,
   credentials, or source corpora.

   When the checkout is volatile or the outcome must move, a copy into another
   ignored path is not durable. At pause, quiesce the outcome and queue writers,
   then export the capsule directory `.krn/runs/delivery-loop/<outcome-id>/`
   and the selected queue into the durable host archive
   `${KRN_OUTCOME_ARCHIVE:-$HOME/.local/state/krn/outcomes}/<outcome-id>/`.

   When `refs/krn/queue-active` exists, save successful output from
   `krn ticket store export --root REPO --json` as `queue.json` in that archive.
   An unreadable selected store blocks the archive; use the file-queue branch
   only when the selector is absent. That branch copies the complete
   `.krn/tickets/` directory with checkout-relative paths. Keep any pre-import
   raw backup as historical data. Other ignored directories retain their own
   consumers and are outside KRN task state.

   Restore the capsule directory and the selected queue into a compatible
   successor checkout. For `queue.json`, run `krn ticket store restore --root
   SUCCESSOR --file ARCHIVE/queue.json`; for a file queue, restore its original
   paths. Complete restoration before `krn state check`, `krn state resume`
   and `krn ticket next`. Queue export preserves task records; the code
   repository owns code objects and effect refs. The archive is an operational
   copy on the host, never a tracked artifact.

   **Falsifier:** compare the complete path/ID set from `krn ticket check
   --root REPO --json` and the `krn ticket next` frontier before export and
   after restore. Include a task created after import and a capsule candidate
   that references it: it must resolve after restore. The negative control
   restores the capsule but omits the queue, producing a missing candidate or
   different task set/frontier. A fresh checkout that skips restore has an
   empty frontier; archive and restore are load-bearing.

   When a composed workflow returns a run
   pointer, upsert one `Outstanding workflow-run cleanup` entry keyed by that
   semantic pointer. Preserve its creating workflow, sole in-goal consumer,
   exact trigger, and state without replacing sibling entries. The creating
   workflow retains cleanup ownership. When the trigger fires, this lifecycle
   writer marks only that entry `CLEANUP_PENDING`, commissions its owner, and
   removes the entry only after verifying the run absent; a failed cleanup marks
   only that entry `BLOCKED`. `none` means the list is empty.

   Record process friction in `Workflow friction and lesson candidates` with
   evidence and the gate, instruction edit, or lab-test it would become.

   At every boundary, and before any `COMPLETE` claim, run
   `krn state check`; `divergent` blocks, while `not-applicable` means no
   file-backed capsule was checked, not a pass. A fresh session may run
   `krn state resume` for the live repository delta and
   `krn state compile` to prefill the mechanical capsule fields; neither
   writes the capsule, and `state resume` prints the workflow lessons.

   For an accepted outcome, discharge every triggered specialist cleanup,
   reconcile tracker closure when configured, remove delivery restart state when
   it exists, disposition every lesson candidate into the workflow-lessons
   page, and complete the native Goal when present as one terminal sequence.
   Record an absent tracker, Goal, run, or cleanup obligation explicitly; do not
   claim `COMPLETE` until every participant that exists is observed terminal.
   Never complete a superseded or abandoned Goal: record its state and next owner
   in the tracker when one exists, request the available user/system cancellation,
   deferral, or other non-active transition, and keep the original run while that
   Goal is active. If a successor Goal needs continuity, transfer only the
   condensed capsule and pointers into its own run, removing the original only
   after the old Goal's non-active state is read back; transfer alone is not
   completion. Keep the capsule in the active Goal/thread state, not by changing
   ignore rules.

   **Done when:** repository, capsule, and every configured tracker, present
   Goal, restart file, or specialist cleanup obligation describe the same
   current state; absent participants are explicit, and every run has one
   consumer and cleanup trigger.

4. **Require returned proof and commission fixed-point review.** Require the
   focused observer and repository gates earned by changed risk; a harness-surface
   commit carries a `Change-contract:` prediction and `npm run changes:check`
   blocks an unmet one at the fixed point, naming the commit to revert or repair. Then give composed upstream
   `code-review` the outcome/spec, bounded diff, instructions, proof and gaps,
   non-goals, and authority state.

   The composed reviewer defaults to `<fixed-point>...HEAD`, which excludes the
   working tree, and expects a tracker document. Supply the review scope
   explicitly (a base that contains the intended work, or the fingerprinted
   working tree), the acceptance/spec, and `tracker=none` when no tracker is
   configured; a working-tree review must say so rather than rely on the
   default. Do not fork the upstream procedure in this repository.

   A mechanical, low-risk 0-budget slice records its cheapest evidence and skips
   fixed-point review only when it changes no behavior, authority, security, or
   spec/acceptance surface; every other slice and explicit review requires it.

   When a lane entry is configured, the proof is the isolated-lane contract: a
   red-at-base preflight, one writer, worktree isolation, the integrator gate,
   the `Change-contract:` trailer, and the publication policy, per
   `docs/research/ticket-protocol.md`. This skill points at that contract; it
   does not restate the runner or integrator procedure.

   Any change to reviewed code, base, acceptance/spec, or applicable standards
   creates a new fixed point and invalidates the old review. An accepted finding
   returns as a bounded composed-upstream `implement` repair only when repair and
   mutation are authorized, followed by focused proof and a fresh review of the
   new fingerprints. Otherwise set `NEEDS_REVIEW` and name the authority blocker
   in the capsule. Reviewer prose never substitutes for the owning disposition.

   When a lane emits machine-readable evidence, record it against the current
   fixed point (base, head or fingerprint, Spec, Standards) with reviewer
   identity and model, a verdict, and per-finding path plus local evidence.
   A disposition is admissible only when (a) the reviewer identity, model, and
   context differ from the implementer's — a review that shares the producing
   context or holds write authority for the outcome is not admissible, (b)
   every accepted finding carries a concrete path and local evidence, and (c)
   the recorded fixed point matches the reviewed fingerprints; advisory lanes
   never upgrade to approval. For a non-trivial change, add at least one
   acceptance check the producer did not author — a composition or held-out
   check — before the disposition counts; dispositions record executed evidence.

   **Done when:** acceptance is observable through the public seam, required
   proof passes, both review axes are dispositioned for the current fixed point,
   and no later mutation has invalidated them.

5. **Advance only authorized lifecycle transitions.** Claim, commit, push,
   open or update a PR, merge, and deploy only under their separate authorities
   and current repository or host policy. A lane whose diff changes exported
   skill bytes is a lane-integration merge: the integrator writes the exact
   lane-integration merge template in the merge commit body — `merge: integrate
   <branch>`, a blank line, `Ticket: <id>`, then
   `Change-contract: <ref>:<direction>` — because the merge commit keeps the
   worker commits and so needs no other trailer. A `MERGED` transition retires
   the merged head branch in the same step: delete it local and remote and
   remove its worktree (`gh pr merge --delete-branch`, or `git branch -D
   <branch>` + `git push origin --delete <branch>` + `git worktree remove
   <dir>`). No merged lane branch or worktree outlives its merge. Promote a
   range that carries a SHA-pinned artifact — the export marker or a lesson
   proof anchor — with a merge commit, or re-pin that artifact in the same
   promotion; a rebase-merge rewrites the SHAs those artifacts name and breaks
   them. At each shared transition, update and
   read back the configured tracker when one exists, and confirm that any native
   Goal still owns the current outcome. For a queue, `krn ticket close` with
   evidence and resolution at the fixed point ends the item, and a refused
   attempt is `krn ticket fail`; both follow the queue's own write authority. At
   the accepted terminal outcome, first
   commission each creating workflow whose cleanup trigger has fired and verify
   its run absent; then close and read back the tracker when configured, remove
   delivery restart state when present, and complete the native Goal as the
   final state action. A remaining cleanup obligation blocks completion. Record
   each absent participant explicitly. Superseded or abandoned work follows the
   non-completion branch in step 3. An unavailable required write or readback is
   a blocker, not a reason to let the capsule diverge. Update both state axes
   from those observations. Outcome
   state is `ACTIVE`, `BLOCKED`, `DEFERRED`, `NEEDS_REVIEW`, `COMPLETE`,
   `SUPERSEDED`, or `ABANDONED`. Publication state is `NOT_REQUESTED`,
   `NOT_AUTHORIZED`, `LOCAL_ONLY`, `PUBLISH_PENDING`, `PR_OPEN`, `MERGE_READY`,
   `MERGED`, or `DEPLOYED`; local green checks do not imply a remote state.

   **Done when:** the capsule exposes the achieved outcome, current evidence and
   non-proofs, review identity, actual publication state, and either no remaining
   required transition or one blocker with its owner and requested action.
   `COMPLETE` additionally requires terminal Goal and tracker readback wherever
   they exist plus a non-`divergent` `krn state check`; `SUPERSEDED` and
   `ABANDONED` never imply Goal completion.
