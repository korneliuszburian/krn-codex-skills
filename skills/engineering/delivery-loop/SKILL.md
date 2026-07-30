---
name: delivery-loop
description: Carry one accepted repository outcome through claim, implementation, proof, independent review, and authorized publication state. Use for autonomous end-to-end delivery; skip a single scoped edit, diagnosis-only work, or review-only work.
---

# Delivery Loop

Keep one accepted outcome moving while the specialized skills retain their own
procedures. This is a thin, goal-aware composer: it owns lifecycle truth,
writer ownership, and handoffs, not implementation, diagnosis, review, tracking,
or publication.

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
   Restart state identity/path and state: ABSENT or <semantic path> [ACTIVE | TRANSFER_PENDING | CLEANUP_PENDING]
   Authority: writes=; commit=; push=; PR=; merge=; deployment/install=
   Evidence observed:
   Explicit non-proofs:
   Review fixed point and Standards / Spec disposition:
   Open unknowns and blockers with owners:
   Durable CONTEXT / ADR / research references:
   Next bounded owner and action:
   </outcome-capsule>

   Exactly one agent or session may mutate tracked files, the outcome branch,
   tracker state, or goal state at a time. Transfer that writer role explicitly
   before a mutating handoff. Parallel work is read-only, pinned to an immutable
   repository or artifact identity, and returns its evidence to the named sole
   writer or integrator for disposition and capsule update. It may not claim
   work, edit, publish, or declare the outcome done.

   **Done when:** one outcome, one writer, one active implementation item at
   most, and evidence, non-proofs, unknowns, durable pointers, fingerprints,
   and every external action's separate authority state are explicit.

2. **Route only the current uncertainty.** Give a clear bounded change to
   `$implement`; a proven failure cause returns there only when repair and
   mutation are authorized. Otherwise retain the bounded diagnosis result and
   its authority state. Give an unknown failure to `$diagnosing-bugs`, a seam or
   ownership question to `$codebase-design`, a contested concept to
   `$domain-modeling`, and an
   external-evidence decision to `$source-to-decision`. If the destination is
   settled but its executable spec is missing, use `$to-spec`. If the settled
   spec cannot fit one fresh implementation context, use `$slice-work`, then
   advance one slice at a time. Do not copy a composed skill's procedure into
   this contract.

   **Done when:** the current owner receives bounded acceptance, an explicit
   mutation-authority state (including none), relevant paths, and the evidence
   it must return.

3. **Refresh the capsule at every context boundary.** Before and after a
   delegated context, fresh session, interruption, implementation, proof,
   review, commit, push, or CI transition, re-read HEAD, status, tracker, goal,
   and host state. Replace the capsule rather than appending a narrative status
   trail.

   When a later session must resume the outcome, the writer may store only the
   capsule and pointers to its authorities at
   `.krn/runs/delivery-loop/<outcome-id>/state.md`, but only after verifying
   `.krn/runs/` is ignored by Git. This optional restart state is owned and
   consumed by `$delivery-loop`; it contains no copied diffs, raw logs,
   credentials, or source corpora. For an accepted outcome, reconcile tracker
   closure when configured, run removal when restart state exists, and native Goal
   completion when present as one terminal sequence. Record an absent tracker,
   Goal, or run explicitly in the capsule; do not claim `COMPLETE` until every
   participant that exists is observed terminal. Never complete a superseded or
   abandoned Goal: when one exists, record that state and its next owner in the
   configured tracker when one exists, request the available user/system
   cancellation or deferral transition, and keep the run while that Goal remains
   active. If a successor Goal needs continuity, transfer only the condensed
   capsule and pointers into that Goal's own run, then remove the original. A run
   never outlives its owning Goal. If the path is not already ignored, keep the
   capsule in the active native Goal/thread state instead of changing ignore rules.

   **Done when:** repository, capsule, and every configured tracker, present Goal,
   or restart file describe the same current state; absent participants are
   explicit, and any restart file has one consumer and cleanup trigger.

4. **Prove and challenge one fixed result.** Require the focused observer and
   repository gates earned by changed risk. Then give `$code-review` the
   accepted outcome or spec, bounded diff, applicable instructions, exact proof
   and gaps, non-goals, and authority state.

   Any change to reviewed code, base, acceptance/spec, or applicable standards
   creates a new fixed point and invalidates the old review. An accepted finding
   returns as a bounded `$implement` repair only when repair and mutation are
   authorized, followed by focused proof and a fresh review of the new
   fingerprints. Otherwise set `NEEDS_REVIEW` and name the authority blocker in
   the capsule. Reviewer prose never substitutes for the initiating workflow's
   disposition.

   **Done when:** acceptance is observable through the public seam, required
   proof passes, both review axes are dispositioned for the current fixed point,
   and no later mutation has invalidated them.

5. **Advance only authorized lifecycle transitions.** Claim, commit, push,
   open or update a PR, merge, and deploy only under their separate authorities
   and current repository or host policy. At each shared transition, update and
   read back the configured tracker when one exists, and confirm that any native
   Goal still owns the current outcome. At the accepted terminal outcome, close
   and read back the tracker when configured, remove restart state when present,
   then complete the native Goal when present as the final state action. Record
   each absent participant explicitly. Superseded or abandoned work follows the
   non-completion branch in step 3. An unavailable required write or readback is a
   blocker, not a reason to let the capsule diverge. Update both state axes from
   those observations. Outcome
   state is `ACTIVE`, `BLOCKED`, `DEFERRED`, `NEEDS_REVIEW`, `COMPLETE`,
   `SUPERSEDED`, or `ABANDONED`. Publication state is `NOT_REQUESTED`,
   `NOT_AUTHORIZED`, `LOCAL_ONLY`, `PUBLISH_PENDING`, `PR_OPEN`, `MERGE_READY`,
   `MERGED`, or `DEPLOYED`; local green checks do not imply a remote state.

   **Done when:** the capsule exposes the achieved outcome, current evidence and
   non-proofs, review identity, actual publication state, and either no remaining
   required transition or one blocker with its owner and requested action.
   `COMPLETE` additionally requires terminal Goal and tracker readback wherever
   they exist; `SUPERSEDED` and `ABANDONED` never imply Goal completion.
