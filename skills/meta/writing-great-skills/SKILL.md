---
name: writing-great-skills
description: Design, rewrite, route, or prune Codex skills so invocation and execution stay predictable. Use for SKILL.md, trigger descriptions, metadata, references, scripts, catalogs, or skill collisions; skip ordinary documentation.
---

# Writing Great Skills

A skill wrangles **predictability** from a stochastic agent: the same useful
process on repeated runs, not identical output. Every line must improve
invocation, execution, or completion enough to earn its context.

Read [glossary.md](references/glossary.md) when a term below is disputed or a
skill misfires through collision, premature completion, sediment, or sprawl.

1. **Give one job one owner.** Collect real prompts before prose: obvious
   positives, closest negatives, explicit mentions, and composition cases.
   Name the workflow, its input, its observable output, and what the neighboring
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

   **Done when:** every positive has one owner and every nearest negative has a
   different owner or deliberately invokes no skill.

2. **Choose who invokes it.** An implicit skill earns always-visible context by
   firing autonomously or by serving another workflow. Put the distinct task,
   live branches, and nearest boundary in its concise model-facing description;
   set `policy.allow_implicit_invocation: true` in `agents/openai.yaml`.

   An explicit-only skill trades context load for human recall. Keep its
   description useful to the picker and set
   `policy.allow_implicit_invocation: false`. Do not add harness-specific
   frontmatter rejected by the repository validator.

   <trigger-case expected="invoke | compose | skip">
   Raw prompt:
   Expected owner:
   Why the nearest alternative loses:
   </trigger-case>

   **Done when:** the description alone separates the prompt matrix without
   relying on the body or on aliases.

3. **Build the information ladder.** Put common ordered actions in `SKILL.md`.
   End each step with a checkable, exhaustive **Done when**. Keep a flat rule in
   the entrypoint only when every branch needs it. Move branch-only mechanisms,
   schemas, examples, and catalogs behind a direct context pointer. Add a script
   only for deterministic work that prose performs unreliably.

   A workflow may be all steps; a durable reference may be all peer rules. Do
   not force numbering onto material with no sequence. Co-locate each concept's
   rule, caveat, and smallest useful example.

   <context-pointer>
   Read or run this when:
   Resource:
   Decision it changes:
   Why it stays out of the entrypoint:
   </context-pointer>

   **Done when:** every resource is reachable exactly on the branch that needs
   it, with no deep reference chain or duplicated procedure.

4. **Write the behavioral grammar.** Lead with the mental model the agent should
   think through. Use imperative numbered steps for real sequence, bold the
   decision each step owns, place conditions beside the action, and finish
   locally with **Done when**. Use semantic XML blocks for contracts, handoffs,
   ledgers, or output shapes the agent must fill—not as ornamental headings.
   Put an inline example beside the choice it disambiguates.

   XML blocks are internal working records by default: fill them while doing
   the work, then render only the useful fields in commentary or the final
   answer. A skill must explicitly name a destination path or require the
   literal block when persistence or exact delivery format is part of its job.
   Never create an artifact merely because an example block exists.

   Prefer one strong leading word such as _vertical slice_, _red repro_, or
   _proof budget_ over repeated weak explanation. State the desired behavior
   positively; reserve prohibitions for hard safety boundaries and pair them
   with the safe action.

   **Done when:** a fresh agent can execute the skill from top to bottom without
   inventing order, output shape, stopping condition, or branch selection.

5. **Prune until every sentence moves behavior.** Apply the no-op test sentence
   by sentence: would a capable agent behave differently without it? Delete
   duplication, stale sediment, generic encouragement, premature summaries,
   repeated source material, and compatibility names. Keep each meaning under
   one semantic owner.

   **Done when:** removing any remaining instruction would change routing,
   execution, safety, or completion for a representative prompt.

6. **Validate, then forward-test.** Validate frontmatter, folder/name identity,
   invocation metadata, direct pointers, manifests, and changed deterministic
   scripts. Then use fresh agents with raw prompts and artifacts; never leak the
   expected answer or suspected flaw into the trial.

   <forward-trial>
   Prompt class: positive | nearest-negative | explicit-only | composition
   Raw prompt:
   Observed owner:
   Observed process:
   Completion evidence:
   Failure or ambiguity:
   </forward-trial>

   Schema green proves structure only. Retain a skill when positives route and
   finish correctly, negatives stay out, composition preserves one workflow
   owner, and repeated trials expose no systematic early stop.

   **Done when:** the fixed prompt matrix passes behaviorally and every remaining
   miss changes either the description, the information ladder, or the
   completion criterion before another trial.
