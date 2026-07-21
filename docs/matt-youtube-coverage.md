# Matt Pocock YouTube workflow coverage

Verified 2026-07-20 from Matt-owned video pages and available transcripts.
This ledger retains mechanisms and KRN decisions, not transcripts.

| Source | Mechanism | KRN disposition |
|---|---|---|
| [Complete AI coding workflow](https://youtu.be/M6mYodf0dJM) | One-time repo setup; bounded grilling/Wayfinder; optional prototype; spec then context-sized tickets; one ticket per fresh session; independent Standards/Spec review. | Adopt the lifecycle and thin setup near-1:1; keep KRN publication authority and existing workflow owners. |
| [Wayfinder v1.1](https://youtu.be/A8mokin_YOs) | A low-resolution map points to one-source decision tickets; fog remains explicit; only the ready frontier is claimed; resolved decisions feed the map before specification. | Adopt for large foggy planning, never as an implementation owner. |
| [Handoff](https://youtu.be/dtAJ2dOd3ko) | Compress context for one named next-session purpose; point to durable artifacts instead of copying them; transient handoffs are disposable. | Adopt the schema and pointers; KRN may resolve working storage through repo policy, but promotes only consumer-owned results. |
| [Building a real feature](https://youtu.be/hX7yG1KVYhI) | Read-heavy exploration is compressed before human alignment; clarify why and edge cases; update ubiquitous language only when it actually changes. | Adopt; reject mandatory documentation churn for routine implementation. |
| [AFK software factory](https://youtu.be/E5-QK3CDVQM) | Eligible issues enter isolated branch/sandbox pipelines; planning identifies unblocked parallel work; review and merge are separate roles. | Lab-test isolation; reject automatic merge-to-main and parallel production WIP as KRN defaults. |
| [Never run `/init`](https://youtu.be/9tmsq-Gvx6g) | Generated giant instruction files consume fixed context and repeat discoverable repository facts. | Adopt strongly: short durable instructions, direct pointers, lazy detail. |
| [Codebase ready for AI](https://youtu.be/uC44zFz7JSM) | Deep modules, simple public interfaces, domain-shaped filesystem and behavioral tests make code itself the strongest context. | Adopt through codebase-design and implementation standards, not more AGENTS prose. |
| [Hardcore review](https://youtu.be/mh5XZ-L5SFQ) | Aggressive structural review can find deletion opportunities but increases false positives; long repetitive prompts muddy priorities. | Keep routine review lean; use deep challenge only as explicit advisory second opinion. |
| [Standards and Spec review](https://youtu.be/DNqsMXH6Eog) | Review requires both repository standards and the originating spec/issue, ideally in fresh independent contexts. | Adopt directly in `code-review`; no repo-local reviewer clone. |
| [Grill with docs](https://youtu.be/6BB6exR8Zd8) | Domain glossary and ADRs are updated during active shared-understanding work; an ADR is earned by a surprising consequential decision. | Adopt in domain-modeling; reject routine ADR generation. |
| [Agent worktrees](https://youtu.be/yv8VZpov8bk) | Worktrees isolate branches but need explicit remote refs, protected main and recovery for unpushed work. | Adopt safeguards; use worktrees only for real independent writers. |
| [Real engineering with Claude Code](https://youtu.be/kZ-zzHVUrO4) | Persist multi-session plans in a shared tracker, checkpoint phase boundaries, then resume from the exact durable phase. | Adopt with native goals plus a repository-selected tracker such as Beads. |
| [Ralph technique](https://youtu.be/_IK18goX4X8) | Autonomous feedback loop is potentially relevant to persistence. | Defer policy adoption until a dedicated full-transcript mechanism pass establishes its safety and stop conditions. |

## Artifact-path decision

Matt normalizes artifact roles rather than forcing every artifact into one
directory: `docs/agents/` for durable adapters, tracker for live work and specs,
ADR for rare decisions, existing repository conventions for durable research,
and disposable storage for handoffs/review packets. KRN keeps that resolver
model but selects a repo-local default through `docs/agents/artifact-paths.json`:
ignored working runs under `docs/agents/runs/` and retained reports under
`docs/agents/reports/`. Individual skills must not invent their own path.

## Non-proof

Popularity and a demonstrated personal workflow do not prove that every KRN
repository needs every stage, that parallel execution is safe, or that an LLM
review is an approval gate. Each adopted mechanism still needs a local consumer
and falsifier.
