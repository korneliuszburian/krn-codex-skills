---
name: writing-for-agents
description: Design, rewrite, route, or prune any document an agent reads - skills, AGENTS.md, CLAUDE.md, system prompts, docs behind a pointer - so invocation, execution, completion, and context load stay predictable.
---

# Writing For Agents

A document for an agent wrangles **predictability** from a stochastic model:
the same useful process on repeated runs, not identical output. Every line
must improve invocation, execution, completion, or context load enough to
earn its keep.

Every document spends one of two budgets: **context load** (always-loaded
material in the window every turn) and **cognitive load** (the human's cost
of knowing which documents exist). Material behind a pointer escapes context
load at the price of the pointer's line; material with no pointer rides on
cognitive load. Full mechanics of every lever: [doc-writing.md](references/doc-writing.md).

Read [glossary.md](references/glossary.md) when a term is disputed or a skill
misfires through collision, premature completion, sediment, or sprawl.

1. **Give one job one owner.** Collect real prompts before prose: obvious
   positives, closest negatives, explicit mentions, composition cases. Name
   the workflow, its input, its observable output, and what the neighbor
   skill still owns.

   <skill-contract>
   Job:
   Leading word:
   Inputs:
   Observable output:
   Completion criterion:
   Positive prompts:
   Closest negative prompts:
   Composes with:
   Must not own:
   </skill-contract>

   Split only for a distinct invocation or when hiding later steps fixes an
   observed premature-completion failure.

   **Done when:** every positive has one owner and every nearest negative has
   a different owner or deliberately invokes no skill.

2. **Choose who invokes it.** An implicit skill earns always-visible context
   by firing autonomously or by serving another workflow; put the distinct
   task, live branches, and nearest boundary in its concise model-facing
   description and set `policy.allow_implicit_invocation: true` in
   `agents/openai.yaml`. An explicit-only skill trades context load for human
   recall; set it false and keep the description useful to the picker.

   Transport fields follow the repository validator's limits (quoted
   `display_name`, bounded `short_description`, `default_prompt` naming
   `$<skill>`). An explicit router only when a measured family of
   user-invoked names is harder to recall than one front door; when one
   exists, any add/remove/rename updates the router in the same change.

   <trigger-case expected="invoke | compose | skip">
   Raw prompt:
   Expected owner:
   Why the nearest alternative loses:
   </trigger-case>

   **Done when:** the description alone separates the prompt matrix without
   relying on the body or on aliases.

3. **Build the information ladder.** The core decision is where each piece
   sits on the hierarchy: (1) **in-file step** — what the agent does, in
   order; (2) **in-file reference** — rules consulted on demand; (3)
   **disclosed reference** — pushed to a separate file behind a context
   pointer. **Progressive disclosure** moves material down the ladder;
   branching is the disclosure test (inline what every branch needs, disclose
   what only some branches reach). **Sprawl** is the failure mode: too long
   even when every line is live.

   A **context pointer's wording**, not its target, decides when the agent
   reaches the material: front-load the leading word, keep one trigger per
   branch (collapse synonyms), cut identity the body carries.

   <context-pointer>
   Read or run this when:
   Resource:
   Decision it changes:
   Why it stays out of the entrypoint:
   </context-pointer>

   Put common ordered actions in `SKILL.md`; end each step with a checkable,
   exhaustive **Done when**. Keep a flat rule in the entrypoint only when
   every branch needs it. Co-locate each concept's rule, caveat, and smallest
   useful example. Add a script only for deterministic work prose performs
   unreliably; the skill owns its executable (`~/.agents/skills/<name>/scripts/`
   or the repository discovery path), never the caller's bare `scripts/`.

   Classify repository adapters as **hard** (fails closed with exact setup)
   or **soft** (names its reduced fallback) dependencies. Working state
   starts in the repository's ignored run boundary and promotes only with a
   named consumer, durable destination, and cleanup rule. Delegated work
   binds an execution envelope (paths, identity, authority, output shape,
   consumer, non-proofs).

   **Done when:** every resource is reachable exactly on the branch that
   needs it, with no deep reference chain or duplicated procedure.

4. **Write the behavioral grammar.** Lead with the mental model. Match shape
   to behavior (thin composer vs imperative sequence vs flat peer rules).
   Bold only the decision a real step owns; XML blocks are internal working
   records unless persistence is part of the job.

   **Lead with leading words**: a compact pretrained concept repeated as a
   token anchors a whole region of behavior in the fewest tokens — hunt for
   restatements a leading word retires. **Phrase positively**: negation drags
   the forbidden behavior into context; a prohibition earns its place only as
   a hard safety boundary, paired with the positive target.

   **Design the completion criterion**: clarity (can the agent tell done from
   not-done? a vague bound invites premature completion — sharpen the bound
   first, split the sequence only across a real context boundary) and demand
   (how much it requires — "every modified model accounted for" forces
   legwork where "produce a change list" does not).

   **Done when:** a fresh agent can execute the document top to bottom
   without inventing order, output shape, stopping condition, or branch
   selection.

5. **Prune until every sentence moves behavior.** No-op test sentence by
   sentence: would a capable agent behave differently without it? The
   **environment is a source of truth** — a document restating it is a
   **cache**, earning its load only when the lookup is expensive (cache the
   unwritten convention, the reason, the gotcha; leave lookups to the
   environment). Check every line for **relevance**; without pruning the
   fate is **sediment** — stale layers that settle because adding feels safe
   and removing feels risky.

   **Done when:** removing any remaining instruction would change routing,
   execution, safety, completion, or context load for a representative
   prompt.

6. **Validate, then forward-test.** Validate frontmatter, folder/name
   identity, invocation metadata, direct pointers, manifest identity,
   retirement metadata, and changed deterministic scripts. Then use fresh
   agents with raw prompts and artifacts; never leak the expected answer or
   suspected flaw into the trial.

   <forward-trial>
   Prompt class: positive | nearest-negative | explicit-only | composition
   Raw prompt:
   Observed owner:
   Observed process:
   Completion evidence:
   Failure or ambiguity:
   </forward-trial>

   Schema green proves structure only. Retain a skill when positives route
   and finish correctly, negatives stay out, composition preserves one
   workflow owner, and repeated trials expose no systematic early stop.

   **Done when:** the fixed prompt matrix passes behaviorally and every
   remaining miss changes either the description, the information ladder, or
   the completion criterion before another trial.
