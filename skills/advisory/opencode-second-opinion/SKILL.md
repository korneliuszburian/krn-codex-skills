---
name: opencode-second-opinion
description: Request one bounded, read-only advisory opinion from an explicit independent OpenCode reviewer model on an explicit path or artifact. Use only by explicit request; it neither edits nor produces a diff and never runs on the initiating agent's own model.
---

# OpenCode Second Opinion

Use DeepSeek as an advisory reader, not an implementation or approval lane. The
pass has one question and one explicit target path. It returns prose findings;
the initiating workflow verifies and dispositions them locally.

1. **Fix the question and target.** Name the absolute repository or artifact
   directory OpenCode may inspect, the precise question, allowed paths, and
   what the opinion must not decide. Do not provide a diff, request a patch,
   or ask it to edit.

   <opinion-brief>
   Question:
   Target directory:
   Allowed paths:
   Local evidence already checked:
   Return: findings with path and line references, or `no finding`
   Does not decide:
   </opinion-brief>

   **Done when:** a fresh reader can answer from the named target without
   reconstructing the conversation or seeing unrelated material.

2. **Create private working state.** From the target repository, make one
   ignored run directory at `.krn/runs/opencode-second-opinion/<run-id>/` and
   save the completed brief as `prompt.md`. Redact credentials, environment
   files, private user data, and unrelated paths. The runner writes `raw.jsonl`
   and extracts a completed final answer into `opinion.md`, and records
   `meta.json` with the prompt SHA-256, model, variant, and target identity.
   A failed or rejected run retains the partial stream as `raw.failed.jsonl`
   and the reason as `failure.txt` instead of destroying evidence; retain
   those only while the initiating Goal needs them.

   **Done when:** the prompt and later response stay under one owned run
   directory, rather than beside source files or in a shared temporary path.

3. **Run one non-interactive, read-only opinion.** Invoke the installed runner
   with absolute paths. It requires `OPENCODE_SECOND_OPINION_MODEL` to name an
   explicit reviewer model from a different family than the initiating agent;
   there is no default, so a run cannot silently execute on the author's own
   model. `OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS` (default `600`) bounds the
   run; a timeout or a rejected stream fails closed and retains the partial
   evidence. The runner passes OpenCode's provider-specific `--variant`,
   defaulting to `max`; set `OPENCODE_SECOND_OPINION_VARIANT` only to a
   supported non-empty provider variant when a different effort is required.
   It requests `--format json` and accepts an opinion only when the event
   stream ends in `step_finish` with `reason: "stop"` and non-empty text for
   that final message, and only when every cited path resolves inside the
   target directory (mechanical scope denial). It never passes `--interactive`,
   `--auto`, a continuation flag, or an edit request.

   ```bash
   OPENCODE_SECOND_OPINION_MODEL=<explicit independent reviewer model> \
   OPENCODE_SECOND_OPINION_VARIANT=max \
   ~/.agents/skills/opencode-second-opinion/scripts/run-opinion.sh \
     /absolute/target-repository \
     /absolute/target-repository/.krn/runs/opencode-second-opinion/<run-id>/prompt.md \
     /absolute/target-repository/.krn/runs/opencode-second-opinion/<run-id>/opinion.md
   ```

   OpenCode configuration must already authorize the configured provider and
   variant. A missing executable, unsupported variant, unauthorised provider,
   failed command, timeout, malformed event stream, out-of-scope citation, or
   missing terminal final answer produces no completed result; resolve that
   locally rather than treating a partial stream as approval.

   **Done when:** `opinion.md` is a completed response for the same target and
   model invocation, with no source modification requested or accepted.

4. **Verify and close.** Treat every claim as a hypothesis. Inspect each cited
   path and line locally, classify it as `accept_and_fix`, `evidence_gap`,
   `reject_with_evidence`, `follow_up`, or `human_decision`, and record that
   in `disposition.md`. The opinion does not prove correctness, readiness,
   security, or approval. Delete the run when its in-goal consumer finishes or
   the Goal closes; transfer only condensed verified truth to a successor.

   **Done when:** each retained finding has local evidence and a named next
   owner, or the run has been removed.
