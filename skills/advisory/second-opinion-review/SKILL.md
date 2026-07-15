---
name: second-opinion-review
description: Hand scoped research, rewrite, or fixed-point challenge to Claude and verify the result locally. Invoke explicitly after defining evidence and authority; Claude is advisory, never approval.
---

# Second Opinion Review

Claude is a fresh pair of eyes with a bounded brief, not a gate. Use a
background handoff when it needs to investigate or rewrite in an isolated
worktree; use the tool-free checker when a fixed artifact only needs an
adversarial challenge.

1. **Choose one role.** Use `researcher` to turn sources into mechanisms,
   `rewrite-maker` to produce a candidate patch in a disposable worktree, or
   `checker` to falsify a fixed claim. Never ask one pass to make and approve
   the same result.

   <review-contract>
   Question or objective:
   Role: researcher | rewrite-maker | checker
   Current ref or artifact:
   Allowed sources and paths:
   Expected deliverables:
   Local evidence already available:
   Proof required:
   Does not prove:
   Human-only decisions:
   </review-contract>

   **Done when:** the pass has one role, one fixed point, and an observable
   deliverable.

2. **Check the Claude window.** Claude must not run from 08:00 inclusive until
   12:00 exclusive in `Europe/Warsaw`; that is the operator's premium-token
   window. There is no override.

   ```bash
   node ~/.agents/skills/second-opinion-review/scripts/check-claude-window.mjs check
   ```

   **Done when:** the preflight reports an open window. A denied window means
   prepare the handoff and continue local work until noon; do not invoke
   Claude.

3. **Prepare one branch.** For `researcher` or `rewrite-maker`, read
   [handoff-template.md](references/handoff-template.md); it owns the durable
   handoff, isolated-worktree, source-ledger, and background-launch mechanics.
   For `checker`, read [prompt-template.md](references/prompt-template.md); it
   owns the fixed-evidence contract, structured runner, schema validation, and
   budget boundary. Its transport is fixed by
   [review.schema.json](references/review.schema.json).

   Point to existing issues, commits, diffs, and source paths instead of
   restating them. Pin mutable sources. Redact secrets, credentials, private
   data, environment files, and raw copyrighted corpus in either branch.

   **Done when:** exactly one role-specific reference has produced a brief that
   a fresh pass can execute without reconstructing this conversation.

4. **Launch exactly that pass.** Follow the chosen reference's **Launch**
   section. Record the backend reported by the session; a model alias alone is
   not provider evidence. A linked worktree separates Git ownership but is not
   a filesystem or network sandbox. Claude never gains authority to mutate the
   canonical branch, publish, merge, close work, or decide product trade-offs.

   **Done when:** the background job is named and resumable and this execution
   thread has yielded, or the synchronous checker emitted schema-compatible
   JSON at the declared path.

5. **Verify before retaining anything.** Resume here only after the background
   pass finishes, or continue directly after a synchronous checker. Treat all
   Claude output as a hypothesis. Run the checker validation named in its
   reference when applicable, then inspect cited lines and source coverage
   locally. Classify each item as
   `accept_and_fix`, `evidence_gap`, `reject_with_evidence`, `follow_up`, or
   `human_decision`.

   <review-output>
   Retained findings:
   Rejected findings and evidence:
   Missing evidence:
   Focused verification:
   Follow-up owner:
   Proof:
   Does not prove:
   </review-output>

   **Done when:** every retained factual claim survives current local evidence,
   every accepted change has proportionate proof, and no reviewer prose is
   presented as approval or readiness.

6. **Stop the loop.** Run at most one maker pass and one independent checker
   pass for the same fixed point. Continue only for a newly evidenced finding;
   open-ended reviewer debate is not production progress.

   **Done when:** the owned artifact is locally verified, remaining work has a
   named owner, and the canonical branch contains only decisions supported by
   local evidence.
