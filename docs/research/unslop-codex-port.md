# Unslop port to Codex

Status: `lab-test`, 2026-08-24. Consumer: `$source-to-decision` and the
maintainer's publication loop. This page records a bounded prose-quality
mechanism; it does not claim that a rewrite is more truthful or that every
technical response should be made conversational.

## Decision question

Can an explicit, language-aware prose audit/rewrite reduce repetitive AI tells
in KRN-facing writing without changing facts, protected text, or the author's
intended tone?

## Sources and mechanisms

The Cursor/pstack `unslop` skill describes a four-part loop: scan for patterns,
rewrite while preserving meaning and tone, add a specific voice, and self-audit
for remaining tells. Its examples include puffery, vague attribution, filler,
formulaic structure, chatbot phrases, and abstract jargon. The source is a
useful checklist, not evidence that its English blacklist transfers to Polish
or to code and evidence artifacts. [Source](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md)

The separate `mshumer/unslop` project uses a different mechanism: generate many
samples for a named domain, analyze repeated defaults, and review the generated
profile and before/after output for specificity. That supports measuring local
patterns instead of guessing a universal blacklist, but it adds model and
sample-quality assumptions. [Source](https://github.com/mshumer/unslop)

## KRN decision

**Decision:** `lab-test` a narrow explicit-only Codex port. Do not install a
global always-on final pass and do not copy Cursor-specific orchestration.

The port has two public modes. `audit` reports concrete tells without changing
the input. `rewrite` runs only on an explicit request and protects code, links,
citations, numbers, direct quotes, and claims. The skill is language-aware and
does not use a fixed English word ban as its proof of quality.

## Pilot and falsifier

Use a small blinded set of representative Polish and English KRN prose: PR
descriptions, research summaries, status updates, and one public-facing copy
sample. Compare baseline and rewritten versions one response at a time.

The port fails if it introduces a factual or citation change, rewrites protected
text, increases review time without a clear quality gain, or is not preferred
over baseline by the human reviewer. A preference win without semantic
preservation is not adoption evidence.

This pilot does not prove general human-likeness, detector evasion, factual
quality, or usefulness for code, logs, schemas, or raw evidence. A later
decision must report those non-proofs and may retain the skill as explicit-only
even if the pilot is useful.
