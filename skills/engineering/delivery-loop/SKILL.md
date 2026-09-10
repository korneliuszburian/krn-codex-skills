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

1. **Bind one outcome and one writer.** Read the closest repository
   instructions, current Git state, configured tracker item when one exists,
   and active native goal when one exists. Create a native goal only when the
   user explicitly requested persistent autonomous progress; otherwise the
   accepted request is the outcome authority. Reconcile a pre-existing goal
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
   Durable CONTEXT / ADR / research references:
   Next bounded owner and action:
   </outcome-capsule>

   Exactly one agent or session may mutate tracked files, the outcome branch,
   tracker state, or goal state at a time. This is a cooperative coordination
   invariant, not process isolation or a security boundary. Transfer that writer role explicitly
   before a mutating handoff. Parallel work is read-only, pinned to an immutable
   repository or artifact identity, and returns its evidence to the named sole
   writer or integrator for disposition and capsule update. It may not claim
   work, edit, publish, or declare the outcome done.

   **Done when:** one outcome, one writer, one active implementation item at
   most, and evidence, non-proofs, unknowns, durable pointers, fingerprints,
   and every external action's separate authority state are explicit.

2. **Route only the current uncertainty.** Select the smallest handler for the
   one unresolved condition in [references/transitions.md](references/transitions.md).
   That table is the canonical routing contract and the definition of the
   harness baseline. Compose the handler and stop at its return boundary; do not
   copy a composed skill's procedure into this contract, and do not manufacture
   a stage.

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
   credentials, or source corpora. When a composed workflow returns a run
   pointer, upsert one `Outstanding workflow-run cleanup` entry keyed by that
   semantic pointer. Preserve its creating workflow, sole in-goal consumer,
   exact trigger, and state without replacing sibling entries. The creating
   workflow retains cleanup ownership. When the trigger fires, this lifecycle
   writer marks only that entry `CLEANUP_PENDING`, commissions its owner, and
   removes the entry only after verifying the run absent; a failed cleanup marks
   only that entry `BLOCKED`. `none` means the list is empty.

   At every boundary, and before any `COMPLETE` claim, run
   `krn-codex state check`; `divergent` blocks, while `not-applicable` means no
   file-backed capsule was checked, not a pass.

   For an accepted outcome, discharge every triggered specialist cleanup,
   reconcile tracker closure when configured, remove delivery restart state when
   it exists, and complete the native Goal when present as one terminal sequence.
   Record an absent tracker, Goal, run, or cleanup obligation explicitly; do not
   claim `COMPLETE` until every participant that exists is observed terminal.
   Never complete a superseded or abandoned Goal: record that state and its next
   owner in the configured tracker when one exists, request the available
   user/system cancellation, deferral, or other non-active transition, and keep
   the original run while that Goal remains active. If a successor Goal needs
   continuity, transfer only the condensed capsule and pointers into that Goal's
   own run, but do not remove the original until the old Goal's non-active state
   is read back. Transfer alone is not consumer completion. If the path is not
   already ignored, keep the capsule in the active native Goal/thread state
   instead of changing ignore rules.

   **Done when:** repository, capsule, and every configured tracker, present
   Goal, restart file, or specialist cleanup obligation describe the same
   current state; absent participants are explicit, and every run has one
   consumer and cleanup trigger.

4. **Require returned proof and commission fixed-point review.** Require the
   focused observer and repository gates earned by changed risk. Then give
   composed upstream `code-review` the accepted outcome or spec, bounded diff,
   applicable instructions, exact proof and gaps, non-goals, and authority state.

   A mechanical, low-risk 0-budget slice records its cheapest evidence and
   skips fixed-point review, including inside an active lifecycle envelope, only
   when it changes no behavior, authority, security, or spec/acceptance surface.
   Every other slice, and every explicitly requested review, requires review.

   Any change to reviewed code, base, acceptance/spec, or applicable standards
   creates a new fixed point and invalidates the old review. An accepted finding
   returns as a bounded composed-upstream `implement` repair only when repair
   and mutation are
   authorized, followed by focused proof and a fresh review of the new
   fingerprints. Otherwise set `NEEDS_REVIEW` and name the authority blocker in
   the capsule. Reviewer prose never substitutes for the initiating workflow's
   disposition.

   When a lane emits machine-readable evidence, record it against the current
   fixed point (base, head or fingerprint, Spec, Standards) with reviewer
   identity and model, a verdict, and per-finding path plus local evidence.
   A disposition is admissible only when (a) the reviewer identity and model
   differ from the implementer's, (b) every accepted finding carries a concrete
   path and local evidence, and (c) the recorded fixed point matches the
   reviewed fingerprints; advisory lanes never upgrade to approval. Any change
   to reviewed code, base, acceptance/spec, or applicable standards creates a
   new fixed point and invalidates the stored disposition, not just the review
   step.

   **Done when:** acceptance is observable through the public seam, required
   proof passes, both review axes are dispositioned for the current fixed point,
   and no later mutation has invalidated them.

5. **Advance only authorized lifecycle transitions.** Claim, commit, push,
   open or update a PR, merge, and deploy only under their separate authorities
   and current repository or host policy. At each shared transition, update and
   read back the configured tracker when one exists, and confirm that any native
   Goal still owns the current outcome. At the accepted terminal outcome, first
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
   they exist plus a non-`divergent` `krn-codex state check`; `SUPERSEDED` and
   `ABANDONED` never imply Goal completion.
