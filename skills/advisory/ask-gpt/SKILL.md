---
name: ask-gpt
description: Gather the current repository context, publish it to Git, and render a demanding read-only analysis prompt for ChatGPT GPT-6 Astra with a fixed findings format; the operator pastes it into the chat and returns the answer for local disposition.
---

# Ask GPT

Turn the current problem into one rigorous, read-only analysis request for
ChatGPT GPT-6 Astra, whose GitHub connector reads the repository. The skill
never edits code, never adopts GPT's answer, and never calls a model itself: it
gathers context, publishes the state, renders the prompt, and hands the answer
back to the owning workflow for verification.

Use the bundled renderer for every prompt; do not hand-write the prompt or paste
a partial diff instead of the commit it belongs to. The answer is advisory
evidence, never an approval or a gate.

1. **Fix the question and the scope.** Name the repository, the branch, the base
   ref, the exact paths or symbols in scope, the decision the analysis must
   inform, and what it must not decide. If the question is vague, write the
   sharpest version you can and let the prompt ask GPT for the rest.
   **Done when:** one question, one base ref, one bounded path set, and the
   forbidden decisions are explicit.

2. **Gather the context deterministically.** Run
   `node ~/.agents/skills/ask-gpt/scripts/render-prompt.mjs --root . --base <ref>
   --question <text> [--focus a,b] [--json] [--allow-unpushed]`. It reads the remote URL, branch,
   HEAD, the remote ref, the dirty state, and the diff stat and name list
   between the base and HEAD, and it renders the prompt from those facts. Never
   type the facts by hand; `--allow-unpushed` is only for drafting a prompt you
   know the connector cannot read yet.
   **Done when:** the renderer exits 0 and the prompt names the same HEAD the
   checkout reports.

3. **Publish the state the prompt points at.** The connector reads the pushed
   commit, never the working tree, so an uncommitted change, an untracked file,
   or a gitignored path is invisible to GPT and the analysis silently misses it.
   Under the repository's commit and push authority, commit every intended file
   and push the branch, then re-run the renderer: it reads
   `git ls-remote origin refs/heads/<branch>`, refuses when the remote ref does
   not equal HEAD, and prints the modified and untracked counts. Never send a
   prompt whose commit is local-only; if publication is not authorized, stop and
   report the exact commit and push that are missing. Never commit secrets.
   **Done when:** the renderer exits 0 with `pushed: yes`, and the working tree
   carries nothing the prompt omits (or the omission is stated as a non-proof).

4. **Render and hand over the prompt.** Copy the fenced block the renderer
   prints into the GPT-6 Astra chat. The prompt is deliberately demanding: it
   fixes the read-only contract, requires `file:line` evidence, separates
   observation from inference, and fixes the answer format (verdict, findings
   with severity and evidence, open questions, non-proofs, next action).
   **Done when:** the operator has the prompt, or a written blocker says why the
   state could not be published.

5. **Disposition the answer locally.** When the answer comes back, verify every
   finding against the code before acting, record each accepted finding as a
   ticket, an ADR, a lesson, or a retirement, and state the non-proofs (GPT
   cannot run the repository gates, cannot see uncommitted state, and cannot
   know the live host). Do not treat agreement as proof.
   **Done when:** every finding has a local disposition and the answer is
   recorded where its consumer will read it.

## References

- [`references/prompting-gpt-6-astra.md`](references/prompting-gpt-6-astra.md) —
  how the prompt is built for this model: framing, evidence bar, output schema,
  and the failure modes to avoid.
- [`references/chatgpt-capabilities.md`](references/chatgpt-capabilities.md) —
  which ChatGPT surface or connector the prompt may name, and the limits of
  each.
