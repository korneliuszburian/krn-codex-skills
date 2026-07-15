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
   rtk node ~/.agents/skills/second-opinion-review/scripts/check-claude-window.mjs check
   ```

   **Done when:** the preflight reports an open window. A denied window means
   prepare the handoff and continue local work until noon; do not invoke
   Claude.

3. **Write the smallest complete handoff.** Start from
   [handoff-template.md](references/handoff-template.md) in a durable
   directory you control — parallel background jobs and restarts clobber shared
   `/tmp` — then point
   to existing issues, plans, commits, diffs, and source paths instead of
   restating them. Include hashes or refs for mutable sources. Redact secrets,
   private data, credentials, environment files, and raw copyrighted corpus.

   For a source pass, require a ledger entry shaped like this:

   <source-decision>
   Source and version -> mechanism -> conditions and traps -> local standard
   -> workflow consumer -> example -> falsifier -> does-not-prove ->
   adopted | rejected | omitted-with-reason
   </source-decision>

   **Done when:** a fresh agent can resume from paths and artifacts without
   reconstructing the conversation or receiving material it should not see.

4. **Launch the right pass.** For research or a candidate rewrite, start from
   a clean disposable worktree and hand it to Claude in the background:

   Both runners pass the current `opus` alias by default. The local Claude Code
   provider configuration still decides which backend serves that alias, so
   record the backend reported by the session and never claim model-provider
   independence from the alias alone. Set `SECOND_OPINION_MODEL` only to choose
   another explicit alias or pinned identifier.

   ```bash
   rtk bash ~/.agents/skills/second-opinion-review/scripts/run-handoff.sh \
     "TypeScript skill research" \
     /absolute/persistent/typescript-handoff.md
   ```

   For an authorized rewrite, grant edit acceptance explicitly. Add only the
   smallest source root the pass must read; `--add-dir` grants tool access and
   does not technically enforce a read-only source contract.

   ```bash
   rtk env SECOND_OPINION_EFFORT=max \
     ~/.agents/skills/second-opinion-review/scripts/run-handoff.sh \
     --accept-edits \
     --add-dir /absolute/bounded/research-root \
     "TypeScript skill rewrite" \
     /absolute/persistent/handoff.md
   ```

   The command returns immediately. Manage or resume the named job with
   `claude agents`; inspect its work only after that background pass finishes.
   The linked worktree separates Git ownership, but it is not a filesystem or
   network sandbox. Claude does not mutate the canonical branch, publish,
   merge, close work, or decide product trade-offs.

   For a fixed-point checker, fill
   [prompt-template.md](references/prompt-template.md), then run the tool-free
   structured reviewer. The runner binds output to
   [review.schema.json](references/review.schema.json); change that transport
   contract deliberately, never ad hoc in a prompt.

   ```bash
   rtk env SECOND_OPINION_MAX_BUDGET_USD=unlimited \
     ~/.agents/skills/second-opinion-review/scripts/run-review.sh \
     /absolute/persistent/topic.md \
     /absolute/persistent/topic.review.json
   ```

   Use an uncapped checker only when the operator explicitly authorizes it;
   otherwise keep the runner's bounded default.

   **Done when:** the background job is named and resumable and this execution
   thread has yielded, or the synchronous checker emitted schema-compatible
   JSON.

5. **Verify before retaining anything.** Resume here only after the background
   pass finishes, or continue directly after a synchronous checker. Treat all
   Claude output as a hypothesis. For a checker, bind every citation to the
   current repository state:

   ```bash
   rtk python3 ~/.agents/skills/second-opinion-review/scripts/validate-review.py \
     check /absolute/persistent/topic.review.json \
     /absolute/persistent/topic.md
   ```

   Inspect cited lines and source coverage locally. Classify each item as
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
