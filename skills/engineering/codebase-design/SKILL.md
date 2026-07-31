---
name: codebase-design
description: Find architecture hotspots or deepen a module interface, public seam, or dependency shape. Use for growing monoliths, behavior ownership, or testability through production seams; skip routine implementation and fixed-point review without an architecture question.
---

# Codebase Design

Start from observed change friction, not a preferred abstraction. Deepen one
real boundary so callers learn a smaller interface while one owner hides more
policy. A large cohesive module may already be deeper than many tiny wrappers.

Use the vocabulary precisely:

- **Module** — any function, class, package, or tier-spanning slice with an
  interface and implementation.
- **Interface** — everything a caller must know, including invariants, errors,
  ordering, configuration, and performance.
- **Seam** — where behavior can vary without editing the caller.
- **Adapter** — one concrete implementation occupying a seam.
- **Depth** — useful leverage per unit of interface a caller must learn.
- **Locality** — change, bugs, knowledge, and proof concentrated behind one
  interface instead of repeated across callers.

1. **Choose the decision surface.** Use `directed-design` when the caller,
   module, interface, or dependency is already named. Use `architecture-audit`
   when the user asks where ownership or monolith friction lives; then read
   [architecture-audit.md](references/architecture-audit.md) and carry only its
   strongest evidenced candidate into the remaining steps.

   <design-contract>
   Mode: directed-design | architecture-audit
   Scope and current ref:
   Named caller or candidate:
   Observed friction:
   Decision requested:
   Implementation authority: none | separate scoped handoff
   </design-contract>

   Discovery remains read-only. Separate implementation authority permits a
   scoped handoff; it does not turn the audit into an opportunistic refactor.

   **Done when:** the work names one current boundary and one concrete cost;
   file size, aesthetics, and hypothetical reuse are not the problem statement.

2. **Map what the caller must know.** Trace the real caller through its public
   seam into implementation and any dependency, persistence, or IO boundary.
   Record sequencing, invariants, configuration, failure recovery, and policy
   that leak back into callers.

   <boundary-map>
   Caller and desired outcome:
   Current interface:
   Caller-owned sequencing and invariants:
   Leaked or duplicated policy:
   External or varying dependency:
   Current behavior and failure contract:
   Current proof surface:
   </boundary-map>

   **Done when:** the current path is concrete enough to point to where each
   piece of knowledge and policy lives.

3. **Earn the seam.** Read
   [deep-modules.md](references/deep-modules.md) when proposing a new seam,
   comparing module shapes, or deepening an existing cluster. Apply its
   deletion probe, interface-pressure test, and seam evidence to the mapped
   boundary. One adapter proves a concrete implementation, not an abstraction.

   Prefer a direct call, move, rename, or deletion when it resolves the
   friction with fewer concepts. Improve testability through the production
   interface; never export internals only for tests.

   **Done when:** the proposed boundary owns real policy or variation and can
   state what becomes local or disappears.

4. **Design ownership twice.** For a consequential public boundary, sketch two
   meaningfully different ownership shapes. Moving the same methods behind a
   differently named wrapper is one design, not two.

   <design-option>
   Interface the caller learns:
   Policy and complexity hidden:
   Failure model:
   Dependency direction:
   Production proof surface:
   Incremental migration cost:
   Deletion result:
   </design-option>

   Compare current call sites and concrete failure modes. Use a focused static
   or behavior probe only when it can distinguish the options; a broad test
   suite or green CI cannot select an architecture.

   **Done when:** the options differ in ownership, their costs are explicit,
   and one wins by reducing caller knowledge without hiding unresolved risk.

5. **Make the smallest durable decision.** Choose one interface, policy owner,
   and migration slice. Reject or defer adjacent cleanup whose consumer,
   owner, or falsifier is unclear.

   <design-decision>
   Smallest decision:
   Real caller and outcome:
   Chosen interface:
   Policy owner and hidden complexity:
   Failure contract:
   Rejected alternative and reason:
   First vertical slice:
   Falsifier at the production seam:
   Does not prove:
   Returned to: <initiating owner | requester>
   </design-decision>

   When an existing workflow such as `$wayfinder` initiated the question, return
   the decision there first; that owner reapplies the global routing gate. Only a
   directly requested design-and-build outcome with one clear, authorized first
   slice may hand the decision to `$implement`. Otherwise stop with the decision
   and explicit non-proof; do not begin a speculative refactor.

   **Done when:** the decision shows how one named caller would gain a smaller
   contract, assigns real policy to one owner, bounds the first slice, and can
   be handed off without inventing another abstraction.
