# Research index

This directory is compiled decision memory. It is not a notebook, transcript
archive, or chronological log. Each topic page is rewritten as evidence changes;
Git history records the sequence.

## Curation contract

1. Start with a named local decision and future consumer.
2. Prefer current primary sources; pin a revision or verification date.
3. Keep stated claims separate from KRN inferences.
4. Merge new evidence into the existing topic page. Mark an old conclusion
   superseded in the same place instead of keeping two current versions.
5. Keep limitations, counterexamples, falsifiers, and non-proofs beside the
   decision they constrain.
6. Keep raw corpora, captions, prompts, model output, caches, and working ledgers
   outside Git. Promote only the distilled mechanism and provenance.
7. Delete a topic when it has no current consumer; its history remains in Git.

## Refresh rule

The composed upstream set is refreshed from `mattpocock/skills`; this repository
does not fork or hand-edit those skills. KRN consumes a clean checkout pinned in
`config/upstream-sources.json`, not a moving installer result. Each refresh
records the upstream commit and verification date below, then runs the
repository validation gate. Research claims are rechecked when their source,
local decision, or falsifier changes; the verification date is evidence
freshness, not permanence.

## Topics

| Topic | Current authority | One-line state | Reopen when |
|---|---|---|---|
| Agent orchestration and compact context | [orchestration.md](orchestration.md) | accepted compiled-context spine; bounded register lab did not earn a new store; upstream harness mechanisms are selectively adopted or lab-tested; OpenCode advisory transport hardening remains a lab-test | a recurring routing, restart, review, artifact, writer-admission, or advisory-transport failure survives bounded repair |
| Harmonic harness map | [harmonic-harness.md](harmonic-harness.md) | complete owner map; context, evidence, authority, frontend, and Beads boundaries are explicit; only named falsifiers can promote a new layer | a real consumer exposes an ownership collision, missing stop condition, or failed transfer experiment |
| TypeScript engineering | [`typescript-engineering` references](../../skills/engineering/typescript-engineering/SKILL.md) | inference, boundary, compiler, and proof mechanisms are owned directly by the companion skill | a current compiler/host change contradicts a retained mechanism |
| Capability surface | [capabilities.md](../capabilities.md) | named profiles and evidence-bounded reconciliation | catalog schema, runtime event, or trust boundary changes |
| Reusable frontend delivery evidence | [frontend-delivery-pipeline.md](frontend-delivery-pipeline.md) | browser/evidence mechanisms remain input to later proof; its public pipeline/skill topology is superseded by P7 v2 | evidence-provider seam, fixture gate, distribution contract, or credential-boundary finding changes |
| Frontend authoring decisions | [frontend-authoring.md](frontend-authoring.md) | P7 v2 adopts an optional four-surface source-only package pending fresh behavioral proof; P5 safety and incumbent-migration limits remain | cited source, topology falsifier, authorized incumbent migration, or later frozen protocol changes a disposition |
| Current Matt Pocock skills audit | [mattpocock-skills-deep-audit.md](mattpocock-skills-deep-audit.md) | the current tree has 25 promoted skills plus 12 experimental/misc candidates; the pin already contains the promoted set and no candidate yet earns adoption | a later upstream diff or concrete KRN task changes a candidate's consumer, ownership collision, or falsifier |
| Agent browser | [frontend-browser.md](frontend-browser.md) | Playwright CLI is the canonical low-token control plane; agent-browser is an optional diagnostics adapter | fixture evidence, session/ref identity, or provider cost evidence changes |
| Installation and retirement | [migration.md](../migration.md) | collision-safe symlinks, explicit archive authority, recoverable retirement | installer target or host layout changes |
| Agentic engineering EvidenceSpine | [agentic-engineering-approaches.md](agentic-engineering-approaches.md) | compact typed receipt seam is adopted for test-only use; production adapters remain lab-test | a real MUZG→mini-agi→mise trace passes the same binding, retry, idempotency, and publication-boundary falsifiers |
| Codex completion ledger | [unlazy-codex-port.md](unlazy-codex-port.md) | optional gate ledger with explicit approval and re-verification; no sandbox or lifecycle ownership | second real long-task pilot, measured operator cost, or a false-completion miss |
| Prose quality and unslop | [unslop-codex-port.md](unslop-codex-port.md) | explicit audit/rewrite candidate with protected facts and technical fragments; not an always-on humanizer | blinded pilot shows semantic drift, no preference gain, or unacceptable review cost |

## Primary source ledger

| Family | Primary source and fixed point | Retained mechanism | Verified |
|---|---|---|---|
| Matt Pocock skills | [`mattpocock/skills` at `6654f6b`](https://github.com/mattpocock/skills/commit/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76), compared with current [`main`](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015) | small composable owners, progressive disclosure, leading words, shared language, destination/spec/ticket distinctions; the 2026-09-10 audit confirms the promoted set is unchanged at the pin and records open candidates separately | 2026-09-10 |
| Matt on global instructions | [AGENTS.md guide](https://www.aihero.dev/a-complete-guide-to-agents-md), [Never Run `/init`](https://www.aihero.dev/never-run-claude-init) | minimal always-loaded context; discoverable facts do not earn permanent prompt space | 2026-07-30 |
| Matt on concise output | [initial before/after](https://www.youtube.com/shorts/I12Mf8KBT1I), [later retraction](https://www.youtube.com/watch?v=9tmsq-Gvx6g) | wording strongly changes presentation, but global placement was later rejected in favor of scoped steering | 2026-07-30 |
| Matt workflow evolution | [v1.1 changelog](https://www.aihero.dev/skills/skills-changelog-v1-1-wayfinder-to-spec-to-tickets-grilling-improvements), [Wayfinder](https://www.youtube.com/watch?v=F3lL98Pj90o) | one fresh context per frontier ticket; exactly research, prototype, grilling, and task tickets; full resolutions remain linked primary sources while the spec is a temporary implementation destination | 2026-07-31 |
| Karpathy compact memory | [LLM knowledge-work gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | immutable sources feed a continuously compiled, indexed synthesis | 2026-07-30 |
| Production memory extension | [Rohit Goyal gist](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) | confidence, recency, supersession, and crystallization matter; graph/search automation is scale-dependent | 2026-07-30 |
| OpenAI Codex | [Long-running work](https://learn.chatgpt.com/docs/long-running-work), [skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Goal owns outcome continuity; skills own methods; subagents isolate bounded work; durable team rules remain checked in | 2026-07-30 |
| OpenAI harness engineering | [Harness engineering](https://openai.com/index/harness-engineering/) | repository knowledge is a maintained map and system of record, not one giant manual; indexes, mechanical freshness checks, and doc gardening keep progressive disclosure alive | 2026-08-19 |
| Long-running harnesses | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) | explicit progress state, clean restart boundaries, and skeptical evaluation help; harness assumptions must be removed or re-tested as models improve; multi-agent ceremony has real cost | 2026-08-19 |
| Agent harness research | [AI Harness Engineering](https://arxiv.org/abs/2605.13357), [Agentic Harness Engineering](https://arxiv.org/abs/2604.25850), [SWE-EVO](https://arxiv.org/abs/2512.18470), [SlopCodeBench](https://arxiv.org/abs/2603.24755), [DeepSWE](https://arxiv.org/abs/2607.07946) | evaluate the model-harness-environment system and long-horizon code evolution, including structural erosion and maintainability; passing a one-shot test is insufficient proof | 2026-08-19 |
| Gate-first harness coordination | [`unlazy` at `da0b00a`](https://github.com/Leonxlnx/unlazy/tree/da0b00a3a6b706b471797cd4ef579ae1001ff6d7) | gates before work, explicit check/expect evidence, re-verification, a natural-joint task tree, and cooperative leases/dispatch can make long-running progress legible | scope and leases remain coordination mechanisms unless enforced outside the model; historical outcome claims are not independent production proof | 2026-08-26 |
| Scope and YAGNI pressure | [`ponytail` at `2ed6c52`](https://github.com/DietrichGebert/ponytail/tree/2ed6c52c9d7e5e56942508591085fd45dea277d3) and its [agentic benchmark](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/benchmarks/results/2026-06-18-agentic.md) | ask whether a feature is needed, then prefer reuse, standard library, native capability, installed dependency, or the smallest direct implementation while retaining security and accessibility checks | the benchmark is self-reported and small; it supports a heuristic, not a separate global workflow or transfer claim | 2026-08-26 |
| Bounded experimentation | [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch/tree/228791fb499afffb54b46200aca536f79142f117) | compare one bounded change against a stable baseline and keep only measured improvement | 2026-07-30 |
| Agent knowledge distillation | [Self-Instruct](https://arxiv.org/abs/2212.10560), [Distilling Step-by-Step](https://arxiv.org/abs/2305.02301), [DSPy](https://arxiv.org/abs/2310.03714), [ReAct](https://arxiv.org/abs/2210.03629), [Voyager](https://arxiv.org/abs/2305.16291) | extract mechanisms, hard negatives, executable verification, and promotion only after evidence; papers inform hypotheses, not KRN proof | 2026-09-10 |
| Task graph adapter | [`gastownhall/beads`](https://github.com/gastownhall/beads/tree/a690b0a8c4d1ddc4f0bd9bf767499625dd71bc96) | `ready`, dependency edges, atomic claims, and supersession are a bounded lab candidate; KRN retains lifecycle and authority | 2026-09-10 |

## TypeScript provenance

The operator-supplied *Total TypeScript — The Essentials* final 2026 PDF was
reviewed across 545 pages, 16 chapters, and its index; SHA-256
`9265b55c2010d847edd3ad4d9b2429bc8e6ec40b52e159a8d4f56bcab5e900da`.
The incomplete public companion was checked at
[`948a00e`](https://github.com/mattpocock/total-typescript-book-015/commit/948a00e8d59c838d89a4c7fddf7acd089bd0f73d).
Current compiler mechanics remain owned by the official
[module reference](https://www.typescriptlang.org/docs/handbook/modules/reference),
[declaration guide](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html),
and [project references](https://www.typescriptlang.org/docs/handbook/project-references).

The distilled decisions live in the seven direct references of
`typescript-engineering`; no course passage, exercise, solution, or raw
extraction is committed. Static success remains separate from runtime, emit,
bundle, host, and consumer proof.
