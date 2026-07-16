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

   **Done when:** the window state is recorded. An open result permits the later
   launch; a denied result permits only preparation in steps 3–4, then local
   work until noon. The runner checks again and cannot invoke Claude early.

3. **Open one owned pass directory.** Never invent an artifact folder beside
   the active repositories. Create one private, unique directory for this pass:

   ```bash
   node ~/.agents/skills/second-opinion-review/scripts/prepare-artifacts.mjs topic-slug
   ```

   The helper uses `SECOND_OPINION_ARTIFACT_ROOT` when it names an absolute
   operator-owned root. Otherwise it uses
   `$XDG_STATE_HOME/krn/second-opinion-review` when set, or
   `~/.local/state/krn/second-opinion-review`. Record the printed path as
   `pass_dir`. The initiating operator owns its contents, classification,
   retention, and cleanup.

   **Done when:** this pass has exactly one `0700` directory outside the
   candidate repository, and every durable brief, prompt, review result, or
   disposition below names a file inside it.

4. **Prepare one branch.** For `researcher` or `rewrite-maker`, read
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

5. **Launch exactly that pass.** Follow the chosen reference's **Launch**
   section. Record the backend reported by the session; a model alias alone is
   not provider evidence. A linked worktree separates Git ownership but is not
   a filesystem or network sandbox. Claude never gains authority to mutate the
   canonical branch, publish, merge, close work, or decide product trade-offs.

   **Done when:** the background job is named and resumable and this execution
   thread has yielded, or the synchronous checker emitted schema-compatible
   JSON at the declared path.

6. **Verify before retaining anything.** Resume here only after the background
   pass finishes, or continue directly after a synchronous checker. Treat all
   Claude output as a hypothesis. Run the checker validation named in its
   reference when applicable, then inspect cited lines and source coverage
   locally. Classify each item as
   `accept_and_fix`, `evidence_gap`, `reject_with_evidence`, `follow_up`, or
   `human_decision`. Keep only the role brief or checker prompt, validated
   structured output when one exists, an original source/coverage ledger, and
   the local disposition. Do not copy source corpora, caches, model transport,
   or disposable worktree state into `pass_dir`.

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
   every accepted change has proportionate proof, `disposition.md` records the
   local classification, and no reviewer prose is presented as approval or
   readiness.

7. **Stop the loop and close its storage.** Run at most one maker pass and one
   independent checker pass for the same fixed point. Continue only for a newly
   evidenced finding; open-ended reviewer debate is not production progress.
   Remove the disposable worktree after its candidate changes are accepted or
   rejected. Keep `pass_dir` while its issue, goal, or follow-up depends on the
   evidence; once that owner closes, either archive the minimal retained set in
   the owner's durable research system or delete the pass directory explicitly.
   The runners delete their private temporary transport automatically; they do
   not decide retention of operator evidence.

   **Done when:** the owned artifact is locally verified, remaining work has a
   named owner, the canonical branch contains only decisions supported by local
   evidence, and both the worktree and `pass_dir` have an explicit final state.
