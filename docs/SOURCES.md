# Source Ledger

This repository stores distilled mechanisms, not source corpora.

## Matt Pocock

- Source: [mattpocock/skills](https://github.com/mattpocock/skills)
- Inspected commit: `9603c1cc8118d08bc1b3bf34cf714f62178dea3b`
- Complete corpus and video ledger:
  [matt-skills-coverage.md](matt-skills-coverage.md).
- Broader source index, pipeline audit, and working notes:
  [matt-pocock/README.md](matt-pocock/README.md).
- Adopted: concise entrypoints, explicit invocation policy, progressive
  disclosure, resumable background handoffs that point to durable artifacts,
  pre-agreed public seams, vertical slices, independent Standards and Spec
  review, deep modules, deletion as a design test, composition over
  restatement, and leading imperative steps with a local `Done when`.
- Rejected: copying the full upstream skill collection, generic destructive
  link scripts, mandatory test-first work for changes with no runtime risk,
  and Claude-specific invocation frontmatter as Codex policy.
- KRN adaptation: Claude handoffs use a clean linked worktree, keep private
  corpora out of the handoff, resolve one operator-owned artifact directory,
  and are mechanically denied from 08:00 inclusive until 12:00 exclusive in
  `Europe/Warsaw`.

## Matt Pocock — coding-agent skills flow

- Source: [My New Coding Agent Skills Setup](https://www.youtube.com/watch?v=M6mYodf0dJM),
  published and inspected 2026-07-16.
- Evidence: full English auto-captions retained outside this repository,
  SHA-256
  `3b852d7e36a44d5855c1955b89053dbbc0a80b56f24f6bcd685df06f7a1e5bdd`.
- Adopted mechanisms: explicit scope and harness selection, user-invoked skills
  as a context/cognitive-load trade, thin global pointers, shared-understanding
  work before implementation, durable spec/ticket compression, fresh-context
  vertical slices, and independent Standards plus Spec review.
- Boundary: the video's reported 38 installed skills and approximate context
  threshold are observations of that recorded setup, not invariants of the
  later 41-entrypoint repository or of Codex.
- Selected workflow-video coverage and per-video dispositions:
  [matt-youtube-coverage.md](matt-youtube-coverage.md).

## Matt Pocock — `/wayfinder` demo

- Source: [LIVE: The /wayfinder Demo](https://youtu.be/251hsWgoTPM), streamed
  2026-07-13 and inspected end to end 2026-07-16.
- Evidence: full English auto-captions retained outside this repository,
  SHA-256
  `59670e24ade68f96fd838f90feb9956a56f01e326ad82533b9517ce20cdaf02a`.
- Mechanisms observed: decision tickets on a shared map; the map as an index
  into richer artifacts; frontier and fog-of-war vocabulary; claim-before-work
  with one ticket resolved per session; research subagents reporting into the
  ticket; model, harness, and environment treated as separate leverage layers;
  a tight orchestrating thread; and parallel dispatch limited to independent,
  ready work.
- KRN implication: repositories that install Beads already have a concrete
  wayfinding owner for destination, fog, decision tickets, native dependencies,
  claims, and the ready frontier. The global catalog still leaves durable task
  state to each repository and long-running outcome state to native Codex goals.
- Observed friction: disposable worktrees required dependency and environment
  setup, sessions needed manual coordination, approval boundaries interrupted
  some actions, and the map did not finish during the livestream.
- Decision: adopt map/frontier/fog behavior through repo-local Beads, and adopt
  bounded AFK source campaigns through the `second-opinion-review` researcher
  with `source-to-decision` retaining adoption authority. Reject a duplicate
  global Wayfinder, universal tracker protocol, and always-on orchestrator:
  they still lack one cross-repository owner and falsifier.
- Does not prove: any deferred mechanism should become a universal KRN skill,
  that one tracker fits every repository, or that a demo outperforms the
  current system on production work. Current routing also does not reject a
  future bounded owner backed by a repeated consumer and behavioral evidence.
- Copyright boundary: no transcript passage, cue, or scene is committed here;
  only original mechanism-level decisions and provenance are retained.

## Matt Pocock — repository setup

- Source: [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/tree/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/engineering/setup-matt-pocock-skills),
  inspected 2026-07-20 at the pinned commit.
- Adopted: one bounded setup pass, idempotent updates to an existing root
  instruction file, a thin skills pointer, repo-owned tracker/domain adapters,
  and one setup owner that stops before normal delivery.
- KRN adaptation: `setup-repository-workflow` classifies the local surfaces and
  composes global owners without copying them. Its deterministic initializer
  adopts Matt's thin instruction block and repo-owned adapters, while adding
  explicit inputs, collision refusal, in-repository path containment, and an
  idempotence falsifier. Broader language-specific CI templates remain deferred
  until repeated repository pilots establish one stable schema.

## KRN `mise-en-palace` delivery pipeline

- Source: [`korneliuszburian/mise-en-palace`](https://github.com/korneliuszburian/mise-en-palace/tree/8352ba740055aaa47e2c786a1ec9eb5fb190d6f3),
  including PRs [#23](https://github.com/korneliuszburian/mise-en-palace/pull/23)
  and [#25](https://github.com/korneliuszburian/mise-en-palace/pull/25), the
  active `main` ruleset, CODEOWNERS, and KRN CI; inspected 2026-07-20.
- Proven mechanism: one outcome branch contains cohesive Conventional Commits
  and explicit Beads state commits; a PR is squash-merged so the durable main
  commit carries `(#PR)`; a follow-up Beads merge record may land separately.
  The active host ruleset requires a PR, linear history, squash merge, a fresh
  branch, and four green checks: fast/type/eval, DB, security, and macOS.
- Review boundary: Codex GitHub review is configured outside the workflow and
  appeared on PR #23 as advisory review pinned to a commit. It is not a required
  status or approval: PR #25 merged with no submitted review, the ruleset
  requires zero approvals, and review threads are not required to resolve.
- KRN decision: adopt the branch -> cohesive commits -> fixed PR -> required CI
  -> squash merge shape as an optional strict repository profile. Keep
  CODEOWNERS and automated Codex review advisory until the host ruleset
  explicitly requires human approval or a mechanically named review status.
  Do not force a ticket number into every inner commit; PR linkage belongs to
  the squash commit, while tracker linkage belongs in Beads state and PR body.

## Matt Pocock — `batch-grill-me`

- Source: [`skills/in-progress/batch-grill-me`](https://github.com/mattpocock/skills/tree/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/in-progress/batch-grill-me),
  inspected 2026-07-16 at the repository commit above.
- Upstream status: explicit-only draft in `in-progress`; it is not in Matt's
  promoted plugin, supported README surface, human docs, or `ask-matt` router.
- Mechanism: ask the whole currently ready decision frontier in one numbered
  round, recommend an answer for each, investigate facts instead of asking the
  user, then recompute dependent questions from the user's decisions.
- KRN decision: adopt the distinct interaction as explicit-only
  `batch-grill-me`, with no persistence or action by default and with delegation
  conditional on actual authority. Keep serial domain conflict resolution with
  `domain-modeling` and durable multi-session maps with the repository tracker.
- Falsifier: the skill asks a downstream question before its prerequisite is
  settled, delegates a user-owned decision, asks for a discoverable fact, or
  mutates artifacts before the user confirms shared understanding.
- Does not prove: batch questioning is universally better than one-at-a-time
  grilling, the upstream draft is release-ready, or a design interview should
  create specs, tickets, or implementation automatically.

## Matt Pocock — `grill-with-docs` changelog

- Source: [Skills Changelog: Ubiquitous Language -> `/grill-with-docs`](https://www.aihero.dev/skills-changelog-ubiquitous-language-grill-with-docs),
  updated 2026-04-30 and inspected 2026-07-21.
- Mechanism: codebase grilling updates bounded domain context and records an
  ADR only for a hard-to-reverse, surprising decision produced by a real
  trade-off; general-purpose grilling remains a separate interaction.
- KRN decision: keep frontier-round interviewing in explicit-only
  `batch-grill-me`; keep active vocabulary and earned ADR decisions in
  `domain-modeling`; let `setup-repository-workflow` install the single- or
  multi-context document layout. Reject a duplicate `grill-with-docs` alias.
- Falsifier: a domain-context prompt routes to `batch-grill-me`, routine work
  generates an ADR, or repository setup becomes the recurring domain owner.
- Does not prove: every codebase needs domain documents or that an ADR should
  be created for routine, reversible implementation choices.

## Matt Pocock — Building Great Agent Skills: The Missing Manual

- Source: [Building Great Agent Skills: The Missing Manual](https://www.youtube.com/watch?v=UNzCG3lw6O0),
  AI Engineer talk, ~20:43, inspected 2026-07-22.
- Mechanism: a skill-authoring rubric with four checks — Trigger (the
  user-invoked vs model-invoked boundary), Structure (ordered steps plus a single
  reference, a minimal SKILL.md), Steering (leading imperative words and real
  legwork per step), and Pruning (remove sediment and no-op steps).
- KRN decision: adopt as confirmation of `writing-great-skills`, which already
  enforces the same four checks with stricter direct-reference pointer
  discipline. No new policy; the alignment is now auditable.
- Falsifier: a promoted skill's description cannot be read for routing without
  opening its body, or a branch reference requires multi-hop chasing.
- Does not prove: that a short skill is automatically clear, or that KRN's
  stricter pointer rules reduce authoring friction.

## Matt Pocock — AGENTS.md and plan-mode rules

- Sources: [A Complete Guide To AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md)
  and [My AGENTS.md file for building plans you actually read](https://www.aihero.dev/my-agents-md-file-for-building-plans-you-actually-read),
  inspected 2026-07-22.
- Mechanism: keep AGENTS.md minimal (one-sentence project description, package
  manager, non-standard build commands); describe capabilities, not file paths;
  enforce deterministic CLI rules through a `PreToolUse` hook rather than prose;
  and make plan-mode plans extremely concise, ending with unresolved questions.
- KRN decision: adopt as confirmation. `config/AGENTS.md` already carries the
  minimal production-first core, the capability-not-path framing, and a
  user-level `PreToolUse` hook for the shell rule. The concision rule is
  consistent with the production loop's "read closest instructions, build the
  smallest slice."
- Falsifier: a repository cannot recover its current language or gates from the
  installed global core, or a deterministic CLI rule is expressed only as prose.
- Does not prove: that every repository instruction is current, or that one
  global core fits every product domain.

## Matt Pocock — How To De-Slop A Codebase

- Source: [How To De-Slop A Codebase Ruined By AI (with one skill)](https://www.youtube.com/watch?v=3MP8D-mdheA),
  ~11:19, inspected 2026-07-22.
- Mechanism: a periodic architecture sweep finds shallow modules to deepen —
  where understanding bounces between many small files, where pure functions
  were extracted only for testability while bugs hide in the call-site glue, and
  where modules are tightly coupled — then emits one deepening issue, typically
  run after a feature surge.
- KRN decision: adopt the signals and the surge trigger into `codebase-design`
  (its `architecture-audit` reference). The audit stays evidence-gated: a feature
  surge is a valid evidence window because it generates the repeated-change
  evidence the audit requires, but a calendar "run weekly" cadence is rejected as
  ceremony without friction. The testability-extraction smell is added to the
  friction-trace list.
- Falsifier: the audit flags formatting, a rename, file-splitting, or an
  abstraction for a hypothetical consumer, or runs without demonstrated friction.
- Does not prove: that every surge needs an audit, or that deepening is always
  right over a direct deletion.

## Matt Pocock — Tracer Bullets

- Source: [Tracer Bullets: Keeping AI Slop Under Control](https://www.aihero.dev/tracer-bullets),
  updated 2026-01-22 and inspected 2026-07-22.
- Mechanism: an agent's sycophancy builds entire horizontal layers in isolation
  ("outrunning its headlights"), producing slop and review burden; the discipline
  is to force tiny end-to-end vertical slices that touch every layer, test each
  immediately, and continue in a fresh context per slice.
- KRN decision: adopt — realized through `slice-work` (decomposes a settled spec
  into one-fresh-session vertical slices, tracer bullet first) and `implement`'s
  caller -> seam -> result contract. The proof budget keeps each slice's
  falsifier proportional. No new mechanism beyond those owners.
- Falsifier: a slice is a horizontal layer (all tests, all CLI, a skeleton) or
  exceeds one fresh-context session.
- Does not prove: that every change needs a formal slice list, or that vertical
  slicing removes the need for review.

## Matt Pocock — Context diet and the smart zone

- Sources: [How To Kill The Bloat In Claude Code's System Prompt](https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt)
  and [Most devs don't understand how context windows work](https://www.youtube.com/watch?v=-uW5-TaVXu4),
  inspected 2026-07-22.
- Mechanism: model quality degrades as the context window fills ("lost in the
  middle"; a smart zone followed by a dumb zone); the lever is a lean context —
  trim bundled tools, disable unused feature clusters, prefer progressive
  disclosure over bloat, and reset between phases.
- KRN decision: adopt as provenance. The thin global `AGENTS.md` core, progressive
  disclosure through direct `references/` pointers, and `managing-codex-capabilities`
  (lean profiles that disable unused integrations) are the KRN realization of the
  smart-zone discipline. A separate `context-hygiene` skill is deferred: the
  mechanism is real but already owned across those surfaces, and a new workflow
  would collide with them.
- Falsifier: a promoted skill or the global core carries bloat a fresh session
  cannot shed, or a disabled integration re-enters the prompt unnoticed.
- Does not prove: that one lean core fits every product domain, or that context
  size is the only quality variable.

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
  [Hooks](https://learn.chatgpt.com/docs/hooks.md),
  [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md),
  and [Long-running work](https://learn.chatgpt.com/docs/long-running-work.md)
- Verified: 2026-07-16.
- Adopted: `~/.agents/skills` as the user authoring location, symlinked skill
  support, descriptions as the implicit routing surface, explicit invocation
  via `policy.allow_implicit_invocation: false`, compact layered
  `AGENTS.md`, and worktrees for concurrent writers.
- Hook decision: adopt one user-level `PreToolUse` command/edit guard for
  narrow, deterministic inspection. It returns the supported
  `permissionDecision: deny` shape for protected destructive targets and parses
  known command prefixes (including `rtk`) defensively. An earlier version
  rewrote commands through `rtk` for token compression; that auto-rewrite was
  removed because the proxy transformed output in ways that broke pipelines and
  hid detail (counts, ahead/behind, missing flags) on large-context models where
  the savings were marginal. Treat the guard as defense in depth: official
  documentation says current interception is incomplete and equivalent work
  may remain possible through another supported tool path. Sandbox, scoped
  authority, backups, and manual review remain separate controls.
- Constraint: same-name skills are not merged; both may appear. Unique active
  ownership is therefore an installation invariant, not a naming preference.
- Repository setup decision: use an explicit, bounded
  `setup-repository-workflow` owner for adopting or condensing local
  instructions, project configuration, tracker boundaries, and deterministic
  gates. Keep normal delivery with native goals and the existing engineering
  skills. Do not generate universal project templates, blanket lifecycle hooks,
  or executioner/reviewer agents. A project hook is earned only by a narrow,
  deterministic local invariant and explicit trust. The official surface model assigns durable
  repository conventions to a short local `AGENTS.md`, trusted settings to
  `.codex/config.toml`, repeated workflows to skills, and host merge policy to
  GitHub.

## Agent workflow research

- Context selection: [Lost in the Middle](https://arxiv.org/abs/2307.03172)
  and [RULER](https://arxiv.org/abs/2404.06654) show that nominal context size
  does not guarantee reliable use of relevant evidence. KRN therefore adopts a
  complete bounded review packet—spec, fixed diff, applicable authority,
  proof, gaps, non-proofs, and review questions—instead of a repository-wide
  dump. Falsifier: seeded Standards/Spec review recall and cost do not improve
  over the unstructured dump.
- Minimal orchestration: [Agentless](https://arxiv.org/abs/2407.01489) supports
  a simple localize -> repair -> validate baseline; it does not prove that all
  agent specialization is harmful. KRN adopts one controller composing existing
  workflow owners and rejects an `executioner` persona that merely restates
  `implement`.
- Proof independence: [SWE-bench](https://arxiv.org/abs/2310.06770) and the
  [self-generated tests study](https://arxiv.org/abs/2501.12793) support
  executable behavior evidence while warning that an agent's own tests may
  encode the same misunderstanding. KRN prefers an existing public observer or
  independent fixture and keeps reviewer prose advisory.
- Reviewer independence: [Self-Preference Bias in LLM-as-a-Judge](https://arxiv.org/abs/2410.21819)
  and [rubric-based self-preference bias](https://arxiv.org/abs/2604.06996)
  motivate fixed-point Standards/Spec review without inheriting the maker's
  rationale as fact. These evaluation studies do not establish LLM review as a
  required CI gate.
- Delegation boundary: [Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296)
  is retained as a lab-test, not a universal rule. KRN keeps production WIP at
  one and delegates only independent read-heavy branches with central
  synthesis until local trials show a reliable benefit.

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
