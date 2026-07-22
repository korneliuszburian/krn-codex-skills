# Matt Pocock — Research Hub

Working research space for Matt Pocock's AI-coding pipeline. This hub
**collects** sources and analyzes coverage; the committed decision ledgers
([`../SOURCES.md`](../SOURCES.md), [`../matt-skills-coverage.md`](../matt-skills-coverage.md),
[`../matt-youtube-coverage.md`](../matt-youtube-coverage.md)) retain the
adopt/reject decisions. New mechanisms found here are candidates to feed those
ledgers through [`source-to-decision`](../../skills/engineering/source-to-decision/SKILL.md).

This is operator-facing research material, not promoted provenance and not agent
runtime memory. It is additive to the existing ledgers and may be pruned or
promoted as decisions are made.

## Contents

| File | Purpose |
|---|---|
| [`sources.md`](sources.md) | Comprehensive indexed sources — YouTube videos, Shorts, AI Hero posts, changelog, repositories, newsletter — organized by pipeline stage, with verification status. |
| [`pipeline-audit.md`](pipeline-audit.md) | Stage-by-stage audit: is each stage of Matt's pipeline *fulfilled* and *described* in KRN? Identifies the fulfilled core, deliberate divergences, genuine gaps, and unledgered sources. |
| [`rozkminy.md`](rozkminy.md) | Brainstorming and improvement proposals (adopt / lab-test / defer / reject), working notes. |

## The pipeline spine

```text
setup -> grill/align -> decision map (Wayfinder) -> [prototype] -> spec/PRD
      -> tickets -> [triage] -> implement -> TDD/proof -> review -> handoff
      -> research/AFK ; with diagnosing-bugs and codebase-design cross-cutting
```

## Relationship to the existing ledgers

- [`../matt-skills-coverage.md`](../matt-skills-coverage.md) — pinned-repo
  mechanism ledger + source-to-decision matrix (the decisions).
- [`../matt-youtube-coverage.md`](../matt-youtube-coverage.md) — per-video
  disposition table (the decisions).
- [`../SOURCES.md`](../SOURCES.md) — top-level provenance for all external
  sources, including Matt.

This hub extends those with broader source collection (Shorts, posts, new talks,
current repo HEAD) and a forward-looking audit that the pinned-time ledgers do
not perform.
