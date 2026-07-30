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
   Outcome and acceptance authority:
   Goal / tracker state:
   Sole writer and active workflow owner:
   Repository base, HEAD, and dirty-state scope:
   Focused proof:
   Review fixed point and Standards / Spec disposition:
   Publication authority and observed state:
   Blocker or next bounded action:
   </outcome-capsule>

   Exactly one agent or session may mutate tracked files, the outcome branch,
   tracker state, or goal state at a time. Transfer that writer role explicitly
   before a mutating handoff. Parallel work is read-only, pinned to an immutable
   repository or artifact identity, and returns its evidence to the named sole
   writer or integrator for disposition and capsule update. It may not claim
   work, edit, publish, or declare the outcome done.

   **Done when:** one outcome, one writer, one active implementation item at
   most, and every external action's authority state are explicit.

2. **Route only the current uncertainty.** Give a clear bounded change to
   `$implement`; a proven failure cause also returns there. Give an unknown
   failure to `$diagnosing-bugs`, a seam or ownership question to
   `$codebase-design`, a contested concept to `$domain-modeling`, and an
   external-evidence decision to `$source-to-decision`. If the destination is
   settled but its executable spec is missing, use `$to-spec`. If the settled
   spec cannot fit one fresh implementation context, use `$slice-work`, then
   advance one slice at a time. Do not copy a composed skill's procedure into
   this contract.

   **Done when:** the current owner receives bounded acceptance, mutation
   authority, relevant paths, and the evidence it must return.

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
   credentials, or source corpora. The loop that created it removes it when the
   outcome is accepted, superseded, or abandoned unless the user explicitly
   requests longer retention. If the path is not already ignored, keep the
   capsule in the active native Goal/thread state instead of changing ignore rules.

   **Done when:** repository, tracker, goal, and capsule describe the same
   current state, and any restart file has one consumer and cleanup trigger.

4. **Prove and challenge one fixed result.** Require the focused observer and
   repository gates earned by changed risk. Then give `$code-review` the
   accepted outcome or spec, bounded diff, applicable instructions, exact proof
   and gaps, non-goals, and authority state.

   Any change to reviewed code, base, acceptance/spec, or applicable standards
   creates a new fixed point and invalidates the old review. An accepted finding
   returns as a bounded `$implement` repair, followed by focused proof and a
   fresh review of the new fingerprints. Reviewer prose never substitutes for
   the initiating workflow's disposition.

   **Done when:** acceptance is observable through the public seam, required
   proof passes, both review axes are dispositioned for the current fixed point,
   and no later mutation has invalidated them.

5. **Advance only authorized lifecycle transitions.** Claim, commit, push,
   open or update a PR, merge, and deploy only under their separate authorities
   and current repository or host policy. Update the capsule after each observed
   transition. Use the smallest truthful state: `LOCAL_COMPLETE`,
   `PUBLISH_PENDING`, `PR_OPEN`, `MERGE_READY`, or `DONE`; local green checks do
   not imply a remote state.

   **Done when:** the capsule exposes the achieved outcome, current proof and
   review identity, actual publication state, and either no remaining required
   transition or one blocker with its owner and requested action.
