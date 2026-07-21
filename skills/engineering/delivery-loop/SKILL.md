---
name: delivery-loop
description: Carry one accepted repository outcome through claim, implementation, proof, independent review, and authorized publication state. Use for autonomous end-to-end delivery; skip a single scoped edit, diagnosis-only work, or review-only work.
---

# Delivery Loop

Keep one result moving through its lifecycle while specialized skills retain
ownership of their work. **This is a state-transition orchestrator, not a maker,
diagnostician, reviewer, tracker, or publisher.**

1. **Resolve one outcome and authority envelope.** Read the closest repository
instructions, configured tracker adapter, active native goal when one exists,
and current Git state. Use a native goal only when the user explicitly requests
persistent autonomous progress. Resolve acceptance, owned paths, the global
WIP limit of exactly one implementation item,
required gates, and authority for commit, push, PR, merge, and deployment.

   <delivery-contract>
   Outcome and human result:
   Acceptance and Spec authority:
   Repository and fixed starting state:
   Tracker item or thread owner:
   Owned paths and WIP limit: 1
   Required proof and review:
   Commit, publication, merge, and deployment authority:
   </delivery-contract>

   If closer instructions request a different WIP limit, report the contract
   conflict and do not claim work until the repository adopts a separate,
   explicit workflow profile.

   **Done when:** exactly one outcome is executable, every external action has
   an authority state, and unrelated dirty work is outside the owned path set.

2. **Resume or claim one frontier item.** If the configured tracker already has
an active item, resume it after checking ownership and current evidence. Otherwise
claim exactly one ready item that directly advances the accepted outcome. Never
claim a second item to route around a blocker. Native plans are ephemeral steps,
not a queue or durable status artifact.

   **Done when:** WIP is one, the active item has acceptance and a falsifier,
   and its tracker/goal state agrees with the repository state.

3. **Route the current uncertainty.** A clear behavior change goes to
`$implement`. An unknown failure first goes to `$diagnosing-bugs`; only a proven
cause returns to `$implement`. Architecture, terminology, and external-source
decisions stay with their existing owners before implementation. Do not create
an executioner persona or copy another skill's procedure into the handoff.

   **Done when:** the selected owner receives a bounded input and returns its
   own completion evidence or exact blocker.

4. **Prove and challenge the fixed result.** Require the focused observer and
repository gates earned by changed risk. Then give `$code-review` the complete
bounded context packet: outcome/spec, fixed diff and path ledger, applicable
instructions/domain authority, exact proof and gaps, authority/publication
state, non-goals, and non-proofs. Standards and Spec remain independent.

   Accepted findings become a new bounded `$implement` repair against the new
fixed point, followed by focused proof and re-review. Reject findings only with
current authority and evidence; never let reviewer prose become approval.

   **Done when:** acceptance is present through the public seam, required proof
passes, both review axes are dispositioned, and the fixed point has not drifted.

5. **Advance publication only within authority.** Create cohesive Conventional
Commits when authorized. Use the repository delivery profile for branch, PR,
required CI, and merge state. A strict profile normally uses one outcome branch,
one PR, fresh required checks, and squash/linear history when host policy says
so. Invoke the installed GitHub publication or CI-fix owner when applicable;
this skill does not silently acquire remote authority.

   **Done when:** the result is `LOCAL_COMPLETE`, `PUBLISH_PENDING`, `PR_OPEN`,
   `MERGE_READY`, or `DONE` with evidence matching the actual authority and host
   state—never a stronger label inferred from local green checks.

6. **Re-read state after every transition.** After claim, implementation,
review repair, commit, push, CI, or interruption, re-read HEAD, status, tracker,
goal, and host state instead of trusting conversation memory. Store transient
packets and retained reports only through the repository artifact-role resolver.

   <delivery-result>
   Final lifecycle state:
   Outcome through public seam:
   Active or closed tracker item:
   Focused proof and repository gates:
   Standards and Spec disposition:
   Commit, PR, CI, merge, and deployment state:
   Remaining blocker with owner and requested action:
   Artifact retention and cleanup:
   </delivery-result>

   **Done when:** no required transition is hidden, the tracker and goal reflect
   current truth, working artifacts have an owner/cleanup trigger, and the next
   action is either authorized and performed or honestly blocked/pending.
