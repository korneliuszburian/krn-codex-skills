---
name: ask-gpt
description: Shape a repository question into a rigorous, evidence-bound prompt for ChatGPT GPT-6 Astra over the GitHub connector and its other surfaces, with a fixed findings format; advisory only, no scripts, and the answer returns for local verification.
---

# Ask GPT

Turn a repository problem into one rigorous prompt for ChatGPT GPT-6 Astra,
whose GitHub connector reads the repository live on demand. This skill is
reference material, not an engine: it ships no scripts, calls no model, and
waits for nothing. You fix the question, prepare what the connector will read,
choose the surface, assemble the prompt from the reference, hand it to the
operator to run in ChatGPT, and disposition the answer through the owning
workflow.

The answer is advisory evidence, never an approval or a gate.

## Invocation

Explicit only. The operator decides when a ChatGPT read is worth the round trip.

## The workflow

1. **Fix the question and the scope.** Name the repository, the branch, the
   commit, the exact paths or symbols in scope, the decision the analysis must
   inform, and what it must not decide. If the question is vague, write the
   sharpest version you can and let the prompt ask Astra for the rest in its
   final section.
   **Done when:** one question, one commit, one bounded path set, and the
   forbidden decisions are explicit.

2. **Prepare what the connector will read.** The connector reads the pushed
   commit, never the working tree; an uncommitted change, an untracked file, or
   a gitignored path is invisible and the analysis silently misses it. Under the
   repository's commit and push authority, publish every intended file and
   record the exact commit SHA the prompt will name. If publication is not
   authorized, stop and report the missing commit instead of sending a prompt
   that describes a state the connector cannot see. Never commit secrets.
   **Done when:** the named commit exists on the remote and the working tree
   carries nothing the prompt omits, or the omission is stated as a non-proof.

3. **Choose the surface and the model settings.** Read
   [`references/chatgpt-capabilities.md`](references/chatgpt-capabilities.md)
   and name only the surface the question needs: the GitHub connector for
   cross-file or cross-history reasoning, deep research for a public landscape,
   the code interpreter for a cheap snippet, web browsing for a live external
   fact, agent mode when the answer needs the browser. State each surface's
   limit beside it. Pick the model and reasoning effort deliberately; the
   settings and when to raise them are in
   [`references/prompting-gpt-6-astra.md`](references/prompting-gpt-6-astra.md).
   **Done when:** the surface, the model, the reasoning effort, and each
   surface's limit are stated.

4. **Assemble the prompt from the contract.** Build the six blocks in order from
   [`references/prompting-gpt-6-astra.md`](references/prompting-gpt-6-astra.md):
   role and contract, fixed point, the question, the evidence bar, the output
   schema, and questions back. Write it by hand from the reference; there is no
   generator. When the repository belongs to a ChatGPT project, apply
   [`references/project-setup.md`](references/project-setup.md) so the project
   instructions, knowledge, and connector scope are in place before the prompt
   names the project.
   **Done when:** the prompt carries all six blocks, pins the commit, and fixes
   the answer schema.

5. **Hand over and retrieve.** The operator pastes the prompt into the chat and
   returns the answer. This skill does not drive a browser, wait on a transport,
   or call a model; an answer that never arrives is a reported blocker, not a
   hang.
   **Done when:** the operator has the prompt, or a written blocker says why the
   state could not be published.

6. **Disposition the answer locally.** Verify every finding against the code
   before acting, record each accepted finding as a ticket, an ADR, a lesson, or
   a retirement, and state the non-proofs: Astra cannot run the repository
   gates, cannot see uncommitted state, and cannot know the live host. Do not
   treat agreement as proof; a recommended change is described, never applied by
   the model.
   **Done when:** every finding has a local disposition and the answer is
   recorded where its consumer will read it.

## What this skill does not do

- No scripts and no bundled renderer: the prompt is written from the reference.
- No browser automation, no daemon, no automatic round trip or waiting.
- No adoption: the answer never edits code, opens a pull request, or bypasses a
  gate.

## References

- [`references/prompting-gpt-6-astra.md`](references/prompting-gpt-6-astra.md) —
  the six-block prompt contract, the output schema, model and reasoning
  settings, multi-turn tactics, and the failure modes to design against.
- [`references/chatgpt-capabilities.md`](references/chatgpt-capabilities.md) —
  every surface the prompt may name, with the full GitHub-connector capability
  and its read-only limit.
- [`references/project-setup.md`](references/project-setup.md) — setting up a
  ChatGPT project for a repository: instructions, knowledge, connector scope,
  and the append-only project memory.
