# Architecture Audit

Find demonstrated change friction before proposing a refactor. File size,
dependency fan-out, churn, and test volume are navigation signals — none is a
verdict by itself.

1. **Pin the audit.** Name the package, subsystem, or changed surface and
   whether evidence comes from current code, a fixed-point diff, or bounded
   recent history — a feature surge is a natural window, since it generates the
   repeated-change evidence this audit requires. Keep discovery read-only.

   **Done when:** the search boundary and evidence window are explicit.

2. **Trace concrete friction.** Look for one behavior requiring unrelated
   caller edits, repeated policy or recovery, callers sequencing internals, a
   public contract exposing storage or transport, one module changing for
   unrelated reasons, behavior split into tiny pure functions extracted only for
   testability while the real bugs hide in the glue between them, or missing
   production seams behind recurring bug and proof friction.

   Use current code first and only the cheapest history needed to confirm a
   repeated cost. Do not run broad tests or CI to manufacture architecture
   evidence.

   **Done when:** every candidate cites current paths and the caller cost they
   demonstrate.

3. **Rank at most three candidates.** Rank repeated change cost and interface
   leakage above aesthetics. Reject anything that only needs formatting, a
   rename, file splitting, or an abstraction for a hypothetical consumer.

   <architecture-candidate>
   Boundary and current paths:
   Real callers:
   Current caller knowledge:
   Leaked or duplicated policy:
   Likely deeper seam:
   Expected deletion or locality gain:
   Migration risk:
   Evidence against this candidate:
   </architecture-candidate>

   **Done when:** no more than three candidates remain and the strongest one
   wins on evidenced ownership cost.

4. **Return the frontier.** If no candidate survives, stop with the evidence
   and an honest no-op result. Otherwise return only the strongest candidate to
   the main workflow; its remaining steps own the deletion probe, interface
   design, and migration decision.

   **Done when:** one evidenced boundary is ready for directed design, or zero
   candidates remain and the audit states what current evidence does not prove.
