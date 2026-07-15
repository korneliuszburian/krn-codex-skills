---
name: writing-great-skills
description: Design, revise, or prune Codex agent skills for predictable invocation and execution. Use when creating SKILL.md, trigger descriptions, invocation metadata, references, scripts, or a repository skill system; skip ordinary documentation.
---

# Writing Great Skills

A skill wrangles predictability from a stochastic agent: the same useful
process on repeated runs, not identical output.

Load [glossary.md](references/glossary.md) when diagnosing invocation,
information-hierarchy, or pruning failures.

## Process

### 1. Own One Job

Collect realistic positive and negative prompts. Name the single workflow the
skill owns, its inputs, output, completion criterion, and adjacent workflows it
must not steal.

Split only when a branch has a distinct invocation or when hiding later steps
prevents observed premature completion. Each model-visible description spends
context and competes for attention.

### 2. Choose Invocation

- **Model or user** — set
  `policy.allow_implicit_invocation: true`. Write a concise model-facing
  description that front-loads the distinct task and boundary.
- **Explicit only** — set
  `policy.allow_implicit_invocation: false`. Keep the description useful to
  the human picker without implying autonomous reach.

Codex policy lives in `agents/openai.yaml`. Do not add harness-specific
frontmatter that the Codex validator rejects.

This step is complete when the description can separate every positive case
from its nearest negative case without relying on the body.

### 3. Build The Information Hierarchy

Keep common ordered actions and their checkable completion criteria in
`SKILL.md`. Move branch-only rules, examples, schemas, and catalogs into a
directly linked `references/` file. Add a script only when deterministic
reliability or repeated fragile code earns it.

Every pointer states when to read or run its target. Avoid deep reference
chains, duplicated procedures, empty scaffolding, and auxiliary README files
inside a skill.

### 4. Prune

For every sentence ask:

1. Does it change behavior from the capable-model default?
2. Is it still relevant to this workflow?
3. Does the same meaning already have another owner?
4. Can a strong leading word replace repeated explanation?
5. Is this reference needed on every branch?

Delete no-ops, sediment, duplication, and aliases. Prefer positive target
behavior; retain a prohibition only as a hard safety boundary paired with the
safe action.

### 5. Validate And Forward-Test

Validate frontmatter, folder/name identity, `agents/openai.yaml`, direct
pointers, and deterministic scripts. Forward-test with fresh agents and raw
artifacts:

- positive prompts should select and follow the skill;
- adjacent negative prompts should select the correct owner or no skill;
- explicit-only skills should stay absent unless named;
- completion criteria should prevent early stopping.

Do not leak the expected answer or suspected flaw into the evaluator prompt.

## Stop Condition

Stop when one workflow has one owner, trigger cases discriminate it from every
neighbor, the entrypoint contains only common live instructions, resources are
reachable on the correct branch, and representative forward tests pass.

## Hard Boundaries

- Never solve description collisions with aliases or duplicated names.
- Never vendor a source corpus as always-loaded skill context.
- Never treat schema validation as evidence that the skill changes agent
  behavior.
