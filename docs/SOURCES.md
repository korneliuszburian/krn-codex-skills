# Source Ledger

This repository stores distilled mechanisms, not source corpora.

## Matt Pocock

- Source: [mattpocock/skills](https://github.com/mattpocock/skills)
- Inspected commit: `e9fcdf95b402d360f90f1db8d776d5dd450f9234`
- Adopted: concise entrypoints, explicit invocation policy, progressive
  disclosure, resumable background handoffs that point to durable artifacts,
  pre-agreed public seams, vertical slices, independent Standards and Spec
  review, deep modules, and deletion as a design test.
- Rejected: copying the full upstream skill collection, generic destructive
  link scripts, mandatory test-first work for changes with no runtime risk,
  and Claude-specific invocation frontmatter as Codex policy.
- KRN adaptation: Claude handoffs use a clean linked worktree, keep private
  corpora out of the handoff, and are mechanically denied from 08:00 inclusive
  until 12:00 exclusive in `Europe/Warsaw`.

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
- Auditable decisions: [typescript-coverage.md](typescript-coverage.md) maps all
  16 chapters, scoped chapter-derived index families, companion gaps,
  consumers, falsifiers, non-proof, and deliberate omissions into the global
  companion. It does not claim a disposition for every individual index term.
- Current official sources:
  [TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
  [module reference](https://www.typescriptlang.org/docs/handbook/modules/reference),
  [declaration files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html),
  and [project references](https://www.typescriptlang.org/docs/handbook/project-references).
  Verified: 2026-07-15.
- Current decision: follow the repository-pinned compiler and its real host.
  TypeScript 7's native toolchain is not a universal upgrade while embedded
  language tooling and programmatic-API consumers retain compatibility limits.
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

## ThePrimeagen

- Source: [My Dev Setup Is Better Than Yours](https://frontendmasters.com/courses/developer-productivity-v2/),
  published 2025-01-31 and verified 2026-07-15.
- Adopted: optimize the working loop for fast access and real use rather than
  aesthetic ceremony; prefer small inspectable shell tools when a general
  automation layer adds more maintenance than leverage; customize around
  observed operator friction instead of copying another person's setup.
- KRN implication: skills expose direct entrypoints, the installer is a small
  auditable script, and deterministic helpers exist only for repeated fragile
  work. A tool must shorten discovery or execution for a named workflow.
- Rejected: editor, terminal, and window-manager preferences as universal
  engineering policy; reinventing infrastructure without a learning or
  production consumer; tool enthusiasm as proof of productivity.
- Falsifier: a fresh operator cannot find the workflow or inspect what a helper
  will mutate faster than with the direct repository path.

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

## Claude Code

- Source: [Claude Code memory](https://code.claude.com/docs/en/memory).
- Verified: 2026-07-15.
- Adopted: Claude reads `CLAUDE.md`, officially supports symlinking it to
  `AGENTS.md`, and treats layered instruction files as additive context. KRN
  therefore installs one semantic core through tool-specific symlinks instead
  of maintaining two copies.
- Boundary: a `CLAUDE.md` instruction guides behavior but is not a security
  sandbox or permission control. Hard execution policy stays in deterministic
  scripts, settings, or hooks.
