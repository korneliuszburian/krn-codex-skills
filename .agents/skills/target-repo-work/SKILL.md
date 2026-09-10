---
name: target-repo-work
description: Inspect, initialize, test, verify, or repair a repository other than the active source checkout with explicit write authority and dirty-state ownership. Use when commands or edits cross into another checkout; skip ordinary work inside the current repository.
---

# Target Repository Work

**Another checkout is separately owned.** Fix the crossing before touching it.
An observation never grants repair authority, and target evidence never proves
the source system by implication.

1. **Choose the crossing mode.** Name both repositories, the target ref, and
   the exact authority.

   <target-crossing>
   Source repository:
   Target repository and ref:
   Requested observation or outcome:
   Mode: observation-only | headless-repair | real-operator
   Allowed and forbidden writes:
   Publication authority:
   </target-crossing>

   Default to `observation-only`. Choose `headless-repair` only when the user
   or originating contract names target writes. Choose `real-operator` only
   when genuine operator actions or a transcript are part of the evidence.
   Credentials, private user data, and irreversible external actions require
   separate explicit authority.

   **Done when:** the target, mode, path budget, and publication boundary are
   explicit and an observation failure cannot widen them.

2. **Take the observation-only fast path.** Read the target's closest
   instructions and only the requested seam. Capture branch, HEAD, status, and
   pre-existing changed paths without investigating unrelated content. Run the
   named non-mutating observer, keep any report outside target source, then
   recheck identity and status.

   If this run changed the checkout, stop immediately and emit an exception
   handoff. Name every created or modified path, the command that can account
   for it, this run as the current mutation owner, and the person or workflow
   receiving the handoff. Preserve the unexpected state; do not clean up,
   rollback, investigate, or repair without renewed authority.

   <target-observation-exception>
   Unexpected changed paths:
   Accounting command:
   Current owner:
   Handoff owner:
   Forbidden without renewed authority:
   </target-observation-exception>

   <target-observation>
   Target identity:
   Dirty state before and after:
   Command or observation and result:
   Proof:
   Does not prove:
   </target-observation>

   On an unchanged target, report that record and stop; rollback,
   implementation, publication, and planned mutation accounting do not belong
   to an observation-only crossing. An exception is a failed observation and
   a mutation handoff, not implicit repair authority.

   **Done when:** the requested observation is bound to an unchanged target and
   its proof boundary is explicit, or every unexpected delta is attributed and
   handed off without further mutation.

3. **Open a write-capable branch only with authority.** For
   `headless-repair` or `real-operator`, read
   [write-capable-targets.md](references/write-capable-targets.md). It owns
   dirty-state attribution, rollback, concurrent-writer handling, composition
   with diagnosis or implementation, target proof, and final handoff.

   **Done when:** the branch-specific workflow returns with every mutation and
   publication decision attributable to its authorized owner.
