---
name: implement
description: Build or refactor an already-scoped code change in one production-first vertical slice. Use when files should change and the desired behavior or proven cause is clear; skip unresolved faults and read-only review.
---

# Implement

Build the smallest complete production path from a real caller to an observable
result. **Production behavior is the work; proof protects only the risk changed
by this slice.**

1. **Fix one outcome and one vertical slice.** Read the closest repository
   instructions, then trace the current caller, public seam, and result before
   choosing files.

   <implementation-contract>
   Outcome:
   Acceptance requirement:
   Caller -> public seam -> observable result:
   Owned paths:
   Changed risk:
   Fastest signal that can disagree:
   Required completion gates:
   </implementation-contract>

   Resolve unclear behavior before editing. If the failure is real but its
   cause is still unknown, switch to `$diagnosing-bugs` and earn a repro before
   returning here.

   **Done when:** every planned edit traces to one accepted outcome and the
   chosen signal can distinguish success from a nearby failure.

2. **Spend the proof budget on changed risk.** Select `0`, `1`, or `N` from the
   global contract before adding proof and reuse an existing observer first.
   Read [behavior-proof.md](references/behavior-proof.md) only when runtime
   behavior, validation, migration, authority, persistence, or a repaired bug
   needs a new falsifier.

   An already-scoped change does not need test-first ceremony. Build the
   production path first; add a red-capable falsifier only when changed risk
   earns one. Broad suites are completion evidence, never the inner loop.

   **Done when:** the budget names the changed risk, or zero names the existing
   observer and why another test would add no information.

3. **Build through the real public seam.** Change the path from caller to
   result in one slice. Keep the interface small. Add an abstraction only when
   it owns policy or isolates a genuinely varying or external boundary.

   For TypeScript source, declarations, or compiler configuration, use
   `$typescript-engineering` beside this workflow and load only its reference
   for the boundary being changed.

   **Example.** Reject an empty source ID at the public parser boundary.
   Production slice: change the parser-owned validation path. Proof: one parser
   behavior case, if no existing case already falsifies it. Not the slice: a
   helper layer, private call-order tests, or a matrix of malformed strings that
   all represent the same invalid state.

   **Done when:** the accepted behavior is reachable through the real caller,
   no production seam exists only for a test, and the diff contains no
   speculative branch.

4. **Tighten in the fastest credible loop.** Run the focused signal after the
   relevant production edit. Read the diff as a design artifact: delete
   pass-through helpers, duplicate models, unused options, temporary probes,
   and ceremony introduced by this slice. Preserve strict validation and type
   boundaries; leave unrelated cleanup untouched.

   Apply the global gate policy to the actual changed surface. Record the
   distinct risk behind any signal broader than the focused observer instead
   of replaying evidence already collected.

   **Done when:** every changed line serves the outcome, the fastest relevant
   signal passes, and every broader gate has a concrete reason to run once.

5. **Make the narrowest honest completion claim.** Account for every changed
   and untracked path, then report behavior separately from publication and
   CI state.

   <implementation-result>
   Outcome present in production:
   Caller -> public seam -> result:
   Proof budget and evidence:
   Repository gates actually run:
   Changed paths:
   Does not prove:
   Publication state:
   </implementation-result>

   Use `$code-review` for an independent fixed-point check when the slice is
   non-trivial, the user asks for review, or `$delivery-loop` owns the active
   lifecycle envelope. A green check is evidence for its claim, not a substitute
   for the delivered behavior.

   **Done when:** acceptance is satisfied through production code, proportional
   proof passes or is honestly blocked, all owned paths are accounted for, and
   no remaining work is hidden behind green CI.
