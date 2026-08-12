# Write-Capable Target Work

Use this only after `target-repo-work` has selected `headless-repair` or
`real-operator` and named the allowed target writes. The entrypoint owns the
crossing; this branch owns mutation-grade state and handoff.

1. **Capture fresh ownership state.** Read the target's closest instructions
   before target commands. Load migration, deployment, or remote-operation
   guidance only when that branch is authorized. Immediately before work,
   capture branch, HEAD, status, and pre-existing paths.

   <target-state>
   Target branch and HEAD:
   Dirty before:
   Pre-existing changed paths and owner:
   Paths owned by this run:
   Concurrent writers:
   Rollback:
   Publication owner:
   </target-state>

   **Done when:** every pre-existing mutation has an owner and this run's path
   budget cannot be confused with it.

2. **Execute only the authorized mode.** In `headless-repair`, change only
   named paths, preserve pre-existing work, and keep rollback available. In
   `real-operator`, preserve the genuine operator action and outcome; never
   relabel a headless run after the fact.

   If a clean target becomes dirty unexpectedly, ownership changes, or another
   writer appears, stop writes and downgrade to observation-only until
   authority is renewed. Use a separate worktree for concurrent writers.

   **Done when:** every command and mutation fits the selected mode and every
   changed path remains attributable.

3. **Follow the selected write branch.** In `headless-repair`, use the
   composed upstream `diagnosing-bugs` first when the cause is unknown, then
   hand the proven or already-scoped change to the composed upstream
   `implement` with the target root, path budget,
   closest instructions, and rollback. Those skills own diagnosis, production
   edits, and proportional proof; this branch keeps target authority around
   them.

   In `real-operator`, perform and preserve only the named genuine operator
   action or transcript. Do not compose diagnosis or implementation merely
   because that action exposes a fault. Stop and open a separately authorized
   `headless-repair` crossing when repair is also requested.

   **Done when:** the selected branch returns its scoped repair or authentic
   operator result without widening target writes, paths, publication, or
   operator claims.

4. **Bind evidence to the target.** Reuse the selected branch's focused
   evidence. Add one target-specific observation only when the cross-repository
   claim has not yet been observed; never replay the same proof through an
   umbrella command.

   <target-evidence>
   Command or observation:
   Exit or result:
   Observable target behavior:
   Proof:
   Does not prove:
   </target-evidence>

   Target evidence does not prove source-repository correctness, product
   readiness, or second-operator usability.

   **Done when:** the evidence can fail for the requested behavior and its
   proof boundary is explicit.

5. **Reconcile ownership and hand off.** Capture final target status and
   account for every path created, modified, or left dirty. Separate semantic
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
