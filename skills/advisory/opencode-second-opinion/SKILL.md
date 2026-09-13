---
name: opencode-second-opinion
description: Request one bounded non-editing OpenCode advisory opinion on an explicit path or artifact. Use only by explicit request through its validated runner; it neither edits nor produces a diff, and its path brief is not a filesystem sandbox.
---

# OpenCode Second Opinion

Use DeepSeek V4.1 Flash (`opencode-go/deepseek-v4.1-flash`) by default as an
independent advisory reader, not an implementation or approval lane. This
provider identifier is listed by `opencode models` and is distinct from the
older DeepSeek V4 Flash identifier, `opencode-go/deepseek-v4-flash`. The
bundled runner always selects the configured `review` agent; callers cannot
override it through the runner. This reduces tool authority but does not prove
filesystem isolation. The pass has one question and one explicit target path.
It returns prose findings;
the initiating workflow verifies and dispositions them locally.

When a calling workflow needs model JSON, set
`OPENCODE_SECOND_OPINION_OUTPUT=json`. The runner then extracts and compacts
exactly one JSON object from the terminal answer, even when prose or one code
fence accidentally surrounds it, and fails closed for prose, malformed JSON,
arrays, or multiple JSON candidates. This is transport normalization only:
the calling workflow must still validate its own schema and must not
synthesize missing fields.

## Transport boundary

Use the bundled runner for every opinion. Do not invoke raw `opencode run` and
then infer an opinion from tool events, partial output, or an absent final
message. After starting the runner, use `check-opinion.sh` on its run directory
instead of inspecting processes or temporary files. A stream is evidence only
when the checker returns `completed` and `opinion.md`, `raw.jsonl`, and
`meta.json` exist; `failed` retains `failure.txt` plus `raw.failed.jsonl` when a
partial stream exists; any other result is pending. The opinion remains
advisory and never replaces the owning workflow's review gate, approval, or
local verification.

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
   `meta.json` with the prompt SHA-256, model, variant, target identity,
   elapsed seconds, and summed token usage when the provider reports it.
   A failed or rejected run retains the partial stream as `raw.failed.jsonl`
   and the reason as `failure.txt` instead of destroying evidence; retain
   those only while the initiating Goal needs them.

   **Done when:** the prompt and later response stay under one owned run
   directory, rather than beside source files or in a shared temporary path.

3. **Run one non-interactive, non-editing opinion.** Invoke the installed runner
   with absolute paths. `OPENCODE_SECOND_OPINION_MODEL` defaults to
   `opencode-go/deepseek-v4.1-flash`, OpenCode Go's identifier for DeepSeek V4.1
Flash. Override it only with an explicit reviewer model from a different
family than the initiating agent. The runner always selects the configured
`review` agent. `OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS` (default `600`) bounds the
   run; a timeout or a rejected stream fails closed and retains the partial
   evidence. The runner passes OpenCode's provider-specific `--variant`,
   defaulting to `max`; set `OPENCODE_SECOND_OPINION_VARIANT` only to a
   supported non-empty provider variant when a different effort is required.
   It requests `--format json` and accepts an opinion only when the event
   stream ends in `step_finish` with `reason: "stop"` and non-empty text for
   that final message, and only when every explicit citation resolves inside
   the target directory. This is an advisory convention, not a filesystem
   security boundary; it is an output-citation filter, not proof that no other
   path was read. Backtick paths, relative
   traversal paths, and line-qualified absolute paths are citations; an
   ordinary prose mention of an existing environment path is not. It never passes
   `--interactive`, `--auto`, a continuation flag, or an edit request.

   ```bash
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

4. **Check completion mechanically.** Do not trust the host tool's command
   lifecycle or poll an OpenCode process. The runner can still be finalizing
   after a host yields. Call the checker against the owned run directory:

   ```bash
   ~/.agents/skills/opencode-second-opinion/scripts/check-opinion.sh \
     /absolute/target-repository/.krn/runs/opencode-second-opinion/<run-id>
   ```

   Exit `0` means `completed`; read `opinion.md`. Exit `1` means `failed`; read
   `failure.txt` and never infer an opinion. Exit `2` means `pending`; wait and
   repeat the same checker. Exit `64` means malformed run state. Do not start a
   second opinion in the same run directory.

   **Done when:** the checker returns `completed` or `failed` for the owned run
   directory and `opinion.md` or `failure.txt` has been read; exit `64` is a
   blocker, not completion.

5. **Verify and close.** Treat every claim as a hypothesis. Inspect each cited
   path and line locally, classify it as `accept_and_fix`, `evidence_gap`,
   `reject_with_evidence`, `follow_up`, or `human_decision`, and record that
   in `disposition.md`. The opinion does not prove correctness, readiness,
   security, or approval. Delete the run when its in-goal consumer finishes or
   the Goal closes; transfer only condensed verified truth to a successor.

   **Done when:** each retained finding has local evidence and a named next
   owner, or the run has been removed.
