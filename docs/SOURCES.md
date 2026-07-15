# Source Ledger

This repository stores distilled mechanisms, not source corpora.

## Matt Pocock

- Source: [mattpocock/skills](https://github.com/mattpocock/skills)
- Inspected commit: `e9fcdf95b402d360f90f1db8d776d5dd450f9234`
- Adopted: concise entrypoints, explicit invocation policy, progressive
  disclosure, pre-agreed public seams, vertical slices, independent Standards
  and Spec review, deep modules, and deletion as a design test.
- Rejected: copying the full upstream skill collection, generic destructive link scripts,
  mandatory test-first work for changes with no runtime risk, and
  Claude-specific invocation frontmatter as Codex policy.

## Total TypeScript

- Private source: *Total TypeScript — The Essentials*, final 2026 PDF supplied
  by the operator.
- SHA-256:
  `9265b55c2010d847edd3ad4d9b2429bc8e6ec40b52e159a8d4f56bcab5e900da`
- Coverage: all 545 pages, 16 chapters, and index were read in order.
- Companion: [total-typescript-book-015](https://github.com/mattpocock/total-typescript-book-015)
- Inspected companion commit:
  `948a00e8d59c838d89a4c7fddf7acd089bd0f73d`
- Adopted: inference inside and explicit public boundaries; external values as
  `unknown`; runtime validation at ingress; discriminated state; deliberate
  derive-versus-decouple; `satisfies` before assertions; strict compiler
  boundaries; compile-time and runtime proof kept separate.
- Does not prove: application runtime correctness, framework-specific behavior,
  database contracts, emitted bundle quality, or every advanced TypeScript
  edge case.
- Copyright boundary: no book passage, exercise, solution, or raw extraction is
  committed here.

## Andrej Karpathy

- Sources:
  [autoresearch](https://github.com/karpathy/autoresearch),
  [program.md](https://github.com/karpathy/autoresearch/blob/master/program.md),
  and [nanochat](https://github.com/karpathy/nanochat)
- Inspected autoresearch commit:
  `228791fb499afffb54b46200aca536f79142f117`
- Adopted: establish a baseline, change one bounded variable, keep comparable
  feedback, retain only measured improvements, prefer simpler equal results,
  and condense long-running context.
- Rejected for shared software work: infinite destructive loops, one metric as
  a substitute for behavioral correctness, unrestricted mutation, and no human
  checkpoint for irreversible or public actions.

## Codex

- Sources:
  [Build skills](https://learn.chatgpt.com/docs/build-skills.md),
  [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md),
  [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md),
  and [Long-running work](https://learn.chatgpt.com/docs/long-running-work.md)
- Verified: 2026-07-15.
- Adopted: `~/.agents/skills` as the user authoring location, symlinked skill
  support, descriptions as the implicit routing surface, explicit invocation
  via `policy.allow_implicit_invocation: false`, compact layered
  `AGENTS.md`, and worktrees for concurrent writers.
- Constraint: same-name skills are not merged; both may appear. Unique active
  ownership is therefore an installation invariant, not a naming preference.
