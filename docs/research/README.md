# Research index

This directory is compiled decision memory. It is not a notebook, transcript
archive, or chronological log. Each topic page is rewritten as evidence changes;
Git history records the sequence.

Status: `accepted`. Consumer: maintainer and `$source-to-decision` promotion.
Owner: maintainer. Verified: 2026-09-10.

## Curation contract

1. Start with a named local decision and future consumer.
2. Prefer current primary sources; pin a revision or verification date.
3. Keep stated claims separate from KRN inferences.
4. Merge new evidence into the existing topic page with itemized, localized
   edits. Mark an old conclusion superseded in the same place instead of
   keeping two current versions, and never let a full rewrite drop a retained
   mechanism, condition, counterexample, or provenance link (ACE's context
   collapse).
5. Keep limitations, counterexamples, falsifiers, and non-proofs beside the
   decision they constrain.
6. Keep raw corpora, captions, prompts, model output, caches, and working ledgers
   outside Git. Promote only the distilled mechanism and provenance.
7. Delete a topic when it has no current consumer; its history remains in Git.

## Durable page contract

Every durable page carries one header ABI so a fresh reader can determine its
state without reading the body:

```text
Status: `<accepted | lab-test | defer | reject>`. Consumer: <reader>. Owner: <writer>. Verified: <YYYY-MM-DD>.
```

- The ABI sits in the page header, before the first `##` section; a topic page
  may add a short qualifier after the status enum.
- `Consumer` names the workflow or operator that reads the page; `Owner` names
  the writer that rewrites it; `Verified` is the last evidence check.
- `accepted` is the page state of an adopted decision; decision dispositions
  keep using `adopt`, `reject`, `lab-test`, and `defer`.
- Each page carries its reopen rule or a `Supersession` line at its end. A page
  without one inherits the `Reopen when` cell of its row below.
- This index is a derived cache: the page is the source, and a page change
  updates its row here in the same change.
- Owned elsewhere: `test/bootstrap-fixture/project/LOCAL.md` stays foreign and
  byte-identical; ADR and `CONTEXT.md` formats follow the composed upstream
  `domain-modeling` owner; skill and reference shapes follow `validate.mjs` and
  the upstream `writing-for-agents` owner.

Consumer: maintainer and `$source-to-decision` promotion. Falsifier: a durable
page whose state is not readable from its header, or a row that disagrees with
its page, survives one normal review pass.

## Source reuse and ephemeral research passes

Before browsing, search this index by canonical URL, owner, revision, or
question. Reuse an existing source identity when the source and decision scope
are unchanged; extend the owning topic instead of creating a second summary. A
refreshed source gets a new verification date and an explicit supersession
note. The primary-source table is an index into decisions, not a chronological
pass log.

A bounded pass may carry `pass-id`, question, consumer, source identities,
disposition (`adopt`, `reject`, `lab-test`, or `defer`), falsifier, non-proof,
and cleanup trigger, but that record stays in the ignored
`.krn/runs/<workflow>/<run-id>/` boundary. When the consumer finishes, promote
only the source identity and decision residue into the canonical topic; remove
the pass artifacts. The registry is provenance and deduplication, never a
generic episodic-memory or transcript-replay system.

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
| Agent orchestration and compact context | [orchestration.md](orchestration.md) | accepted compiled-context spine; bounded register lab did not earn a new store; retrieval stays a composed ladder without a vector store; deterministic spine check covers structural capsule divergence; upstream harness mechanisms are selectively adopted or lab-tested; OpenCode advisory transport is advisory-only with a verified runner contract and no scope isolation; history hygiene is owned by the always-loaded contract with mechanical enforcement deferred | a recurring routing, restart, review, artifact, writer-admission, retrieval, advisory-transport, or history-hygiene failure survives bounded repair |
| Workflow lessons | [workflow-lessons.md](workflow-lessons.md) | bounded cross-run workflow memory ported from the Agents SDK `Memory()` pattern; every lesson carries evidence and its enforcing gate | a lesson survives without a gate, or the page exceeds its row budget |
| TypeScript engineering | [`typescript-engineering` references](../../skills/engineering/typescript-engineering/SKILL.md) | inference, boundary, compiler, and proof mechanisms are owned directly by the companion skill | a current compiler/host change contradicts a retained mechanism |
| Capability surface | [capabilities.md](../capabilities.md) | named profiles and evidence-bounded reconciliation | catalog schema, runtime event, or trust boundary changes |
| Current Matt Pocock skills audit | [mattpocock-skills-deep-audit.md](mattpocock-skills-deep-audit.md) | the current tree has 25 promoted skills plus 12 experimental/misc candidates; the pin already contains the promoted set and no candidate yet earns adoption | a later upstream diff or concrete KRN task changes a candidate's consumer, ownership collision, or falsifier |
| Installation and migration | [migration.md](../migration.md) | collision-safe symlinks, explicit timestamped-backup authority, recoverable retirement | installer target or host layout changes |
| Codex completion ledger | [unlazy-codex-port.md](unlazy-codex-port.md) | optional gate ledger with explicit approval and re-verification; no sandbox or lifecycle ownership | second real long-task pilot, measured operator cost, or a false-completion miss |
| Prose quality and unslop | [unslop-codex-port.md](unslop-codex-port.md) | explicit audit/rewrite candidate with protected facts and technical fragments; not an always-on humanizer | blinded pilot shows semantic drift, no preference gain, or unacceptable review cost |

## Primary source ledger

| Family | Primary source and fixed point | Retained mechanism | Verified |
|---|---|---|---|
| Matt Pocock skills | [`mattpocock/skills` at `6654f6b`](https://github.com/mattpocock/skills/commit/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76), compared with current [`main`](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015) | small composable owners, progressive disclosure, leading words, shared language, destination/spec/ticket distinctions; the 2026-09-10 audit confirms the promoted set is unchanged at the pin and records open candidates separately | 2026-09-10 |
| Matt on global instructions | [AGENTS.md guide](https://www.aihero.dev/a-complete-guide-to-agents-md), [Never Run `/init`](https://www.aihero.dev/never-run-claude-init) | minimal always-loaded context; discoverable facts do not earn permanent prompt space | 2026-07-30 |
| Commit history contract | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) | a typed, optionally scoped commit header carries machine-readable intent; automation and history queries depend on consistent conformance, while an unstructured history is missed by tooling | 2026-09-10 |
| Agentic context engineering | [ACE, ICLR 2026](https://arxiv.org/abs/2510.04618) | contexts as structured evolving playbooks; incremental delta updates plus grow-and-refine prevent context collapse and brevity bias; execution feedback can curate without labels | 2026-09-10 |
| Sleep-time compute | [Letta and UC Berkeley, 2504.13171](https://arxiv.org/abs/2504.13171) | offline precomputation for predictable future queries cuts test-time compute roughly fivefold; the gain tracks query predictability from the context | 2026-09-10 |
| Recursive language models | [MIT CSAIL, 2512.24601](https://arxiv.org/abs/2512.24601) | context as an external variable manipulated by code beats compaction for dense long inputs; sub-calls decompose; even frontier models exhibit context rot | 2026-09-10 |
| Agent memory surveys | [2603.07670](https://arxiv.org/abs/2603.07670), [2605.06716](https://arxiv.org/abs/2605.06716) | working, episodic, semantic, and procedural stores; the episodic-to-semantic transition policy and procedural experience extraction are the underserved, fragile stages | 2026-09-10 |
| Self-correction limits | [Huang et al. 2023](https://arxiv.org/abs/2310.01798), [Tyen et al., ACL 2024](https://arxiv.org/abs/2311.08516), [Stechly et al., ICLR 2025](https://arxiv.org/abs/2402.08115) | intrinsic self-correction degrades reasoning without external feedback; models locate logical errors poorly but correct them reliably once the location is given; sound external verification beats self-critique | 2026-09-10 |
| LLM-judge bias and reliability | [Self-preference, EMNLP 2025](https://aclanthology.org/2025.emnlp-main.86), [2604.22891](https://arxiv.org/abs/2604.22891), [2606.19544](https://arxiv.org/abs/2606.19544) | judges exhibit self-preference and position bias; high reproducibility can coexist with low validity; cross-family and structured dimension-wise evaluation reduce but do not eliminate bias | 2026-09-10 |
| Multi-agent failure taxonomy | [MAST, NeurIPS 2025](https://arxiv.org/abs/2503.13657) | 14 failure modes across specification, inter-agent misalignment, and task verification; failures come from organizational design, and better base models alone will not fix them | 2026-09-10 |
| Context compaction and context rot | [Context length alone hurts, EMNLP 2025](https://aclanthology.org/2025.findings-emnlp.1264), [premature termination, 2606.29718](https://arxiv.org/abs/2606.29718), [TRACE, 2608.06503](https://arxiv.org/abs/2608.06503), [ARC, 2607.25066](https://arxiv.org/abs/2607.25066) | length alone degrades performance despite perfect retrieval and drives premature termination; addressable citations preserve recall where summaries lose it; a compaction boundary is best evaluated by paired continuations from the same state | 2026-09-10 |
| Official harness context guidance | [Anthropic effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [session management](https://claude.com/blog/using-claude-code-session-management-and-1m-context), [long-running Claude](https://www.anthropic.com/research/long-running-Claude), [LangChain deep agents](https://docs.langchain.com/oss/python/deepagents/context-engineering) | proactive compaction with a steering hint, structured note-taking, tool-result clearing, a progress file and test oracle, and subagent context isolation returning condensed results | 2026-09-10 |
| Dynamic Cheatsheet | [EACL 2026, 2504.07952](https://arxiv.org/abs/2504.07952) | self-curated, evolving external memory of concise transferable snippets outperforms transcript replay and static retrieval without weight updates | 2026-09-10 |
| Anthropic long-running harness primitives | [cwc-long-running-agents](https://github.com/anthropics/cwc-long-running-agents), [harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) | default-FAIL acceptance, a fresh-context evaluator with no write tools, an agent-maintained handoff, and a pre-build sprint contract between generator and evaluator | 2026-09-10 |
| Codex customization and discovery | [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md), [skills](https://developers.openai.com/codex/skills), [subagents](https://developers.openai.com/codex/subagents) | AGENTS.md precedence chain root to cwd with closer override, per-cwd `.agents/skills`, and explicit-only subagents returning distilled results | 2026-09-10 |
| Cookbook reliability primitives | [Memory and compaction](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction), [agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) | compaction carries the current run while `Memory()` carries reusable workflow lessons across runs, kept separate from reviewed artifacts; trace-plus-feedback loops turn runs into ranked harness changes | 2026-09-10 |
| Mutation and reward-hacking research | [SWE-Mutation, ACL 2026](https://aclanthology.org/2026.findings-acl.1976), [SpecBench, 2605.21384](https://arxiv.org/abs/2605.21384), [Reward Hacking as Equilibrium, 2603.28063](https://arxiv.org/abs/2603.28063), [MUTGEN, 2506.02954](https://arxiv.org/abs/2506.02954) | LLM-authored suites detect a minority of mutants; the gap between visible validation and held-out composition grows with size; agents structurally under-invest in unmeasured quality dimensions | 2026-09-10 |
| Matt on concise output | [initial before/after](https://www.youtube.com/shorts/I12Mf8KBT1I), [later retraction](https://www.youtube.com/watch?v=9tmsq-Gvx6g) | wording strongly changes presentation, but global placement was later rejected in favor of scoped steering | 2026-07-30 |
| Matt workflow evolution | [v1.1 changelog](https://www.aihero.dev/skills/skills-changelog-v1-1-wayfinder-to-spec-to-tickets-grilling-improvements), [Wayfinder](https://www.youtube.com/watch?v=F3lL98Pj90o) | one fresh context per frontier ticket; exactly research, prototype, grilling, and task tickets; full resolutions remain linked primary sources while the spec is a temporary implementation destination | 2026-07-31 |
| Karpathy compact memory | [LLM knowledge-work gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | immutable sources feed a continuously compiled, indexed synthesis | 2026-07-30 |
| Production memory extension | [Rohit Goyal gist](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) | confidence, recency, supersession, and crystallization matter; graph/search automation is scale-dependent | 2026-07-30 |
| OpenAI Codex | [Long-running work](https://learn.chatgpt.com/docs/long-running-work), [skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Goal owns outcome continuity; skills own methods; subagents isolate bounded work; durable team rules remain checked in | 2026-07-30 |
| OpenAI harness engineering | [Harness engineering](https://openai.com/index/harness-engineering/) | repository knowledge is a maintained map and system of record, not one giant manual; indexes, mechanical freshness checks, and doc gardening keep progressive disclosure alive | 2026-08-19 |
| Long-running harnesses | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) | explicit progress state, clean restart boundaries, and skeptical evaluation help; harness assumptions must be removed or re-tested as models improve; multi-agent ceremony has real cost | 2026-08-19 |
| Agent harness research | [AI Harness Engineering](https://arxiv.org/abs/2605.13357), [Agentic Harness Engineering](https://arxiv.org/abs/2604.25850), [SWE-EVO](https://arxiv.org/abs/2512.18470), [SlopCodeBench](https://arxiv.org/abs/2603.24755), [DeepSWE](https://arxiv.org/abs/2607.07946), [Context as a Tool](https://arxiv.org/abs/2512.22087), [ACON](https://arxiv.org/abs/2510.00615), and [SecureVibeBench](https://arxiv.org/abs/2509.22097) | evaluate the model-harness-environment system, bounded context management, long-horizon code evolution, structural erosion, maintainability, and security; passing a one-shot test or following an explicit security instruction is insufficient proof | 2026-09-10 |
| Frontend evaluator harness | [Anthropic harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) | a skeptical generator/evaluator loop can improve subjective frontend quality and last-mile behavior, but its value depends on task difficulty, model capability, cost, and human acceptance; keep it as a separate lab candidate | 2026-09-10 |
| Gate-first harness coordination | [`unlazy` at `da0b00a`](https://github.com/Leonxlnx/unlazy/tree/da0b00a3a6b706b471797cd4ef579ae1001ff6d7) | gates before work, explicit check/expect evidence, re-verification, a natural-joint task tree, and cooperative leases/dispatch can make long-running progress legible | scope and leases remain coordination mechanisms unless enforced outside the model; historical outcome claims are not independent production proof | 2026-08-26 |
| Scope and YAGNI pressure | [`ponytail` at `2ed6c52`](https://github.com/DietrichGebert/ponytail/tree/2ed6c52c9d7e5e56942508591085fd45dea277d3) and its [agentic benchmark](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/benchmarks/results/2026-06-18-agentic.md) | ask whether a feature is needed, then prefer reuse, standard library, native capability, installed dependency, or the smallest direct implementation while retaining security and accessibility checks | the benchmark is self-reported and small; it supports a heuristic, not a separate global workflow or transfer claim | 2026-08-26 |
| Bounded experimentation | [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch/tree/228791fb499afffb54b46200aca536f79142f117) | compare one bounded change against a stable baseline and keep only measured improvement | 2026-07-30 |
| Agent knowledge distillation | [Self-Instruct](https://arxiv.org/abs/2212.10560), [Distilling Step-by-Step](https://arxiv.org/abs/2305.02301), [DSPy](https://arxiv.org/abs/2310.03714), [ReAct](https://arxiv.org/abs/2210.03629), [Voyager](https://arxiv.org/abs/2305.16291) | extract mechanisms, hard negatives, executable verification, and promotion only after evidence; papers inform hypotheses, not KRN proof | 2026-09-10 |
| OpenAI workflow cookbooks | [Iterative Codex workflows](https://github.com/openai/openai-cookbook/blob/main/examples/codex/iterating-development-workflows-with-codex.md), [Using Goals](https://github.com/openai/openai-cookbook/blob/main/examples/codex/using_goals_in_codex.ipynb), [Cookbook AGENTS.md](https://github.com/openai/openai-cookbook/blob/main/AGENTS.md) | phase files and acceptance gates are useful only when a named outcome consumes them; avoid duplicate plans and unverified claims | 2026-09-10 |
| Anthropic context and harness guidance | [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [agent patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents), [long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [application harness](https://www.anthropic.com/engineering/harness-design-long-running-apps) | just-in-time references, compact restart state, and skeptical evaluation are conditional mechanisms; complexity and cost must earn a consumer | 2026-09-10 |
| Claude memory | [Native memory](https://code.claude.com/docs/en/memory) and the third-party [Remember plugin](https://github.com/Digital-Process-Tools/claude-remember) | adopt explicit bounded handoff semantics; reject transcript replay and plugin code; existing KRN capsules and ignored runs are the local storage boundary | 2026-09-10 |
| Provenance and retrieval research | [W3C PROV-DM](https://www.w3.org/TR/prov-dm/), [ALCE](https://arxiv.org/abs/2305.14627), [RARR](https://arxiv.org/abs/2210.08726), [Adaptive-RAG](https://arxiv.org/abs/2403.14403), [deduplication](https://arxiv.org/abs/2107.06499), [LIMIT v2](https://arxiv.org/abs/2508.21038v2) (Weller et al., ICLR'26) | keep claim-level provenance, canonical-source deduplication, freshness, and supersession; single-vector top-k expressivity is dimension-bounded even under direct optimization, and KRN therefore keeps retrieval as a composed ladder with embeddings as one optional tool; add run-level metadata only when a measured failure names a consumer and falsifier | 2026-09-10 |

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
