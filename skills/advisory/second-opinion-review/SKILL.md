---
name: second-opinion-review
description: Hand scoped research, rewrite, or fixed-point challenge to Claude and verify the result locally. Invoke explicitly after defining evidence and authority; Claude is advisory, never approval.
---

# Second Opinion Review

Claude is a fresh pair of eyes with a bounded brief, not a gate. Use a
source-manifest campaign when it needs to investigate a corpus, a background
handoff for one candidate rewrite in an isolated worktree, or the tool-free
check transport when a fixed artifact only needs an adversarial challenge.

1. **Choose one role.** Use `research` to turn a source-bound shard into a
   validated mechanism ledger, `rewrite` to produce a candidate patch in
   a disposable worktree, or `check` to falsify a fixed claim. A large corpus
   becomes independent research shards followed by one synthesis shard. Never
   ask one pass to research, make, and approve the same result.

   <review-contract>
   Question or objective:
   Role: research | rewrite | check
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
   env SECOND_OPINION_CONTEXT_ROOT=/absolute/owner-repository \
     node ~/.agents/skills/second-opinion-review/scripts/prepare-artifacts.mjs \
     topic-slug research
   ```

   The required second argument is `research`, `rewrite`, or `check`, matching
   step 1. `SECOND_OPINION_CONTEXT_ROOT` names the repository that owns the
   artifacts even when the ambient shell or reviewed checkout differs. A Git
   repository always uses its canonical, ignored
   `.krn/runs/second-opinion-review/<date>-<role>-<slug>-<suffix>` path. When no
   repository owns genuinely ad-hoc work, explicitly set
   `SECOND_OPINION_WORKING_RUNS` to an absolute private runs root; it uses the
   same workflow and pass layout. There is no implicit home fallback or
   configurable repository path. Record the printed path as `pass_dir`. The
   initiating operator owns its contents, classification, retention, and
   cleanup; use the same context variable with `prepare-artifacts.mjs list` to
   enumerate its job state.

   **`OUTPUT_ROOT` contract.** `OUTPUT_ROOT` is the resolved absolute
   `.krn/runs/second-opinion-review` directory, or the explicit ad-hoc root's
   `second-opinion-review` child, recorded in `pass-context.json`. It is a
   contract value, not another environment override. A pass always lives at
   `<OUTPUT_ROOT>/<ISO-date>-<role>-<slug>-<suffix>/`. Resolve the repository by
   realpath, then its fixed repository-relative runs root, so moving the checkout
   between `/home`, `/run/media`, and `/mnt` cannot change ownership.

   **Done when:** this pass has exactly one verified `0700` directory under the
   resolved working root, and every brief, prompt, job record, review result,
   or disposition below names a file inside it.

4. **Prepare one branch.** For `research`, read
   [research-template.md](references/research-template.md); it owns campaign
   manifests, source pins, shards, synthesis dependencies, read-only transport,
   structured results, and budgets. For `rewrite`, read
   [handoff-template.md](references/handoff-template.md); it owns the isolated
   worktree and background patch handoff. For `check`, read
   [prompt-template.md](references/prompt-template.md); it owns the fixed
   evidence contract, structured runner, schema validation, and budget boundary.
   Research and checker transport are fixed by
   [research.schema.json](references/research.schema.json) and
   [review.schema.json](references/review.schema.json).

   A checker finding cites at most 20 inclusive lines
   (`line_end - line_start <= 19`). When one claim genuinely needs disjoint or
   longer evidence, split it into separately identified findings with one
   narrow range and claim apiece. The validator rejects an oversized range and
   the bounded retry requests a complete corrected result; neither layer clips
   or silently discards cited evidence.

   Point to existing issues, commits, diffs, and source paths instead of
   restating them. Pin mutable sources. Redact secrets, credentials, private
   data, environment files, and raw copyrighted corpus in either branch.

   **Done when:** exactly one role-specific reference has produced a brief that
   a fresh pass can execute without reconstructing this conversation, and every
   checker range is already split to 20 lines or fewer.

5. **Launch exactly that pass.** Follow the chosen reference's **Launch**
   section. A research shard is a bounded, budgeted foreground process that may
   be yielded as a long-running execution; its job file makes completion or
   failure durable. A rewrite pass remains a resumable background session.
   Record the backend reported by the session; a model alias alone is not
   provider evidence. A linked worktree separates Git ownership but is not a
   filesystem or network sandbox. Claude never gains authority to mutate the
   canonical branch, publish, merge, close work, or decide product trade-offs.

   **Done when:** the research pass emitted a validated shard result and terminal
   job state, the rewrite job is named and resumable and this execution thread
   has yielded, or the synchronous check emitted schema-compatible JSON and
   a terminal `jobs/checker.job.json` inside the verified pass.

6. **Verify before retaining anything.** Continue after a research shard or
   synchronous check finishes, or resume after the background rewrite pass.
   Treat all Claude output as a hypothesis. Run the research or check
   validation named in its reference when applicable, then inspect cited lines
   and source coverage locally. For check or rewrite findings, classify each
   item as `accept_and_fix`, `evidence_gap`, `reject_with_evidence`,
   `follow_up`, or `human_decision`. For research output, classification is
   evidence triage only: retain the validated ledger, then hand it to
   `$source-to-decision`; only that owner may record `adopt`, `reject`,
   `lab-test`, or `defer` and authorize any later implementation. Keep only
   `pass-context.json`, the role brief or checker prompt, terminal job records,
   validated structured output when one exists, an original source/coverage
   ledger, and the local disposition. Do not copy source corpora, caches, model
   transport, or disposable worktree state into `pass_dir`.

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
   every accepted check or rewrite change has proportionate proof, every
   research recommendation has a named `$source-to-decision` consumer,
   `disposition.md` records the local classification, every checker range
   remains at most 20 lines, and no reviewer prose is presented as approval or
   readiness.

7. **Stop the loop and close its storage.** Run each research shard once and
   synthesis only after its dependencies validate; a failed shard requires a
   new pass directory and fixed campaign rather than an in-place retry. Run at
   most one rewrite pass and one independent check pass for the same fixed
   point. Continue only for a newly evidenced finding; open-ended reviewer
   debate is not production progress. Bounded checker transport retries remain
   one pass; terminal schema diagnostics end that pass instead of inviting an
   external retry loop. Before stopping after a terminal checker failure, write
   `disposition.md` inside the same pass with `status: blocked`, the exact
   diagnostic, and the next owner. Remove the disposable worktree after its
   candidate changes are accepted or rejected. Keep `pass_dir` while its issue,
   goal, or follow-up depends on the evidence; once that owner closes, either
   promote only the distilled decision through `$source-to-decision`'s semantic
   gate, then delete the pass directory explicitly. The runners delete their private
   temporary transport automatically; they do not decide retention of operator
   evidence.

   **Done when:** the owned artifact is locally verified, remaining work has a
   named owner, the canonical branch contains only decisions supported by local
   evidence, and both the worktree and `pass_dir` have an explicit final state.
