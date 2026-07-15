---
name: target-repo-work
description: Inspect, initialize, test, verify, or repair a repository other than the active source checkout with explicit write authority and dirty-state ownership. Use when commands or edits cross into another checkout; skip ordinary work inside the current repository.
---

# Target Repository Work

**Another checkout is separately owned.** Fix its identity, write authority,
and dirty-state ownership before running commands. A failed observation never
grants repair authority, and target evidence never proves the source system by
implication.

1. **Contract the crossing.** Name both repositories and the exact authority
   before touching the target.

   <target-contract>
   Source repository:
   Target repository and ref:
   Requested behavior or observation:
   Mode: observation-only | headless-repair | real-operator
   Allowed writes:
   Forbidden writes:
   Publication authority:
   Rollback:
   </target-contract>

   Default to `observation-only`. Choose `headless-repair` only when the user
   or originating contract names target writes. Choose `real-operator` only
   when genuine operator actions or a transcript are part of the evidence.
   Keep credentials, user data, and irreversible external actions outside a
   headless run unless this contract explicitly authorizes them.

   **Done when:** mode, paths, writes, publication, and rollback are explicit;
   an observation failure cannot silently widen them.

2. **Read the target and capture fresh state.** Read the target's closest
   instructions before target commands. Load only the files on the requested
   seam; read its migration, deployment, or remote-operation guidance only when
   that branch is authorized. Immediately before work, capture branch, HEAD,
   status, and pre-existing paths.

   <target-state>
   Target branch and HEAD:
   Dirty before:
   Pre-existing changed paths and owner:
   Paths owned by this run:
   Concurrent writers:
   Publication owner:
   </target-state>

   **Done when:** every pre-existing mutation has an owner and this run's path
   budget cannot be confused with it.

3. **Execute only the authorized mode.** In `observation-only`, inspect and run
   commands that do not intentionally mutate target source; write reports to a
   disposable location or the authorized source repository. In
   `headless-repair`, change only named paths, preserve pre-existing work, and
   keep rollback available. In `real-operator`, preserve the genuine operator
   action and outcome; never relabel a headless run after the fact.

   If a clean target becomes dirty unexpectedly, ownership changes, or another
   writer appears, stop writes and downgrade to observation-only until authority
   is renewed. Use a separate worktree for concurrent writers.

   **Done when:** every command and mutation fits the selected mode and every
   changed path remains attributable.

4. **Compose the target workflow.** In `observation-only`, run only the named
   non-mutating observer. In `headless-repair`, use `$diagnosing-bugs` first
   when the cause is unknown, then hand the proven or already-scoped change to
   `$implement` with the target root, path budget, closest instructions, and
   rollback. Those skills own diagnosis, production edits, and proportional
   proof; this skill keeps authority and dirty-state ownership around them.

   **Done when:** the selected workflow returns a scoped result without
   widening target writes, paths, publication, or operator claims.

5. **Bind evidence to the target.** Reuse the composed workflow's focused
   evidence. Add one target-specific observation only when the cross-repository
   claim has not yet been observed; never replay the same proof through an
   umbrella command. Target evidence does not prove source-repository
   correctness, product readiness, or second-operator usability.

   <target-evidence>
   Command or observation:
   Exit or result:
   Observable target behavior:
   Proof:
   Does not prove:
   </target-evidence>

   **Done when:** the evidence can fail for the requested behavior and its
   proof boundary is explicit.

6. **Reconcile ownership and hand off.** Capture final target status and account
   for every path created, modified, or left dirty. Separate semantic
   completion from commit, push, PR, deployment, or other publication. Publish
   only with separate authority.

   <target-handoff>
   Mode and authority:
   Target identity:
   Dirty state before and after:
   Owned patch:
   Verification:
   Unresolved mutations and owner:
   Rollback or handoff:
   Publication state:
   </target-handoff>

   **Done when:** mode-specific success is met, pre-existing work is preserved,
   every unresolved mutation has a named owner and rollback, and publication is
   reported separately.
