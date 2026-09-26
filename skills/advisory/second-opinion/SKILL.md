---
name: second-opinion
description: Request one bounded, non-editing advisory opinion on one explicit artifact from an independent model family through a validated runner (Codex gpt-6-astra/sol or OpenCode DeepSeek), or shape the same question for ChatGPT. Explicit only; advisory, never approval.
---

# Second Opinion

Get one independent read on one artifact before you commit to a decision. The
reviewer is a **different model family** from the author, sees a **bounded
brief**, and returns **prose findings only**. Its answer is advisory evidence;
you verify and disposition it locally. It is never an approval, a gate, or a
patch.

## When this is worth it

A stronger reviewer helps in proportion to how much it **verifies** and how
little it **opines**. It helps when the artifact has a checkable ground truth,
the reviewer is genuinely independent, and the request is one falsifiable claim.
It adds cost and noise when the reviewer is the same family, the task is
subjective, or you show it your plan — that measures anchoring, not review.
Read [`references/brief-standard.md`](references/brief-standard.md) for the
evidence and the exact brief rules before writing a brief.

## Invocation

Explicit only. The operator decides when a second opinion is worth the round
trip. This skill never auto-fires.

## The workflow

1. **Fix one question and one artifact.** Name the single decision or claim
   under review and the exact path, commit, or excerpt the reviewer may see.
   If you have more than one question, run more than one pass. State what the
   opinion must **not** decide.

2. **Write the brief from the standard.** Use
   [`references/brief-standard.md`](references/brief-standard.md): rubric and
   allowed labels first, then the artifact; **withhold your own plan,
   conclusion, and rationale**; require one concrete falsifier; allow
   `INSUFFICIENT_INFO`. Save it as an absolute `prompt.md`.

3. **Run the validated runner.** Choose the transport in
   [`references/transports.md`](references/transports.md) and run:
   ```bash
   bash ~/.agents/skills/second-opinion/scripts/run-opinion.sh \
     <codex|opencode> <absolute-target-dir> <absolute-prompt.md> \
     <target>/.krn/runs/second-opinion/<run-id>/opinion.md
   ```
   Then use `check-opinion.sh` on the run directory instead of inspecting
   processes or partial output. Only `completed` with `opinion.md`, `raw.jsonl`,
   and `meta.json` present is evidence.

4. **Verify and disposition.** Read
   [`references/disposition.md`](references/disposition.md). Treat every claim
   as a hypothesis: inspect each cited `path:line` locally and mark it
   `accept_and_fix`, `evidence_gap`, `reject_with_evidence`, `follow_up`, or
   `human_decision`. A Codex-family opinion counts for reviewer rotation only
   when it authored no part of the change.

For a ChatGPT/GitHub-connector read instead of a local runner, shape the prompt
with [`references/gpt-astra-prompt.md`](references/gpt-astra-prompt.md) and hand
it to the operator; the disposition step is identical.

## Transport boundary

Use the bundled runner for every local opinion. Do not invoke raw `codex exec`
or `opencode run` and infer an opinion from tool events, partial output, or an
absent final message. The runner enforces the run directory, the artifact set,
the timeout, and the exit contract; the checker, not the host lifecycle, is the
source of truth. Read-only protects the workspace, not `~/.codex` or the
network, so this is a narrow-authority convention, **not a filesystem sandbox**.

## What this skill does not do

It does not edit, patch, diff, approve, or replace the owning workflow's review,
approval, or local verification. It does not ship a second opinion for a
subjective artifact with no ground truth, and it never treats a same-family
answer as independent evidence.
