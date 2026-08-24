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

Sources pinned and retrieved on 2026-08-24:

- Cursor/pstack `unslop` at commit
  [`4612556`](https://github.com/cursor/plugins/commit/46125561306434d8a1d7745d540d8932ab0cd2a2),
  file [`SKILL.md`](https://github.com/cursor/plugins/blob/46125561306434d8a1d7745d540d8932ab0cd2a2/pstack/skills/unslop/SKILL.md);
- `mshumer/unslop` at commit
  [`edcb623`](https://github.com/mshumer/unslop/commit/edcb62386d129c65e4395f0cfcc9168eb1ba2148),
  file [`skills/unslop/SKILL.md`](https://github.com/mshumer/unslop/blob/edcb62386d129c65e4395f0cfcc9168eb1ba2148/skills/unslop/SKILL.md).

The Cursor/pstack `unslop` skill describes a four-part loop: scan for patterns,
rewrite while preserving meaning and tone, add a specific voice, and self-audit
for remaining tells. Its examples include puffery, vague attribution, filler,
formulaic structure, chatbot phrases, and abstract jargon. The source is a
useful checklist, not evidence that its English blacklist transfers to Polish
or to code and evidence artifacts. [Pinned source](https://github.com/cursor/plugins/blob/46125561306434d8a1d7745d540d8932ab0cd2a2/pstack/skills/unslop/SKILL.md)

The separate `mshumer/unslop` project uses a different mechanism: generate many
samples for a named domain, analyze repeated defaults, and review the generated
profile and before/after output for specificity. That supports measuring local
patterns instead of guessing a universal blacklist, but it adds model and
sample-quality assumptions. [Pinned source](https://github.com/mshumer/unslop/blob/edcb62386d129c65e4395f0cfcc9168eb1ba2148/skills/unslop/SKILL.md)

## KRN decision

**Decision:** `lab-test` a narrow explicit-only Codex port. Do not install a
global always-on final pass and do not copy Cursor-specific orchestration.

The port has two public modes. `audit` reports concrete tells without changing
the input. `rewrite` runs only on an explicit request and protects code, links,
citations, numbers, direct quotes, named entities, qualifiers, and claims. It
also preserves the source structure and makes the smallest useful edit to an
existing prose span or element: no new headings, lists, examples, or sections
unless the user asks for restructuring.
The skill cannot alter those protected semantics; a request to change them
leaves `$unslop` for a separate content or source-to-decision workflow. The
skill is language-aware and does not use a fixed English word ban as its proof
of quality.

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

## Exploratory overlay result

An exploratory six-task smoke pilot ran on 2026-08-24 after the skill merge.
Each task ran once in a baseline fixture and once in an otherwise identical
fixture with a compact Fabien-style `AGENTS.md` overlay. The 12 runs used
`gpt-5.6-sol`, `workspace-write`, `--ephemeral`, `--ignore-user-config`, and
`--ignore-rules`. Three code tasks passed their existing tests in both lanes;
three prose tasks preserved their required facts and protected fragments.

Observed differences:

- one retry implementation was byte-identical;
- a host/port implementation was shorter under the overlay, with only error
  wording differences in independent probes;
- a `formatBytes` implementation extracted constants under the overlay but
  silently truncated its unit list: `1 ZiB` became `1024 EiB` for an input
  outside the visible tests;
- prose rewrites were sometimes more scannable, but one release note was
  identical and no blinded human preference was collected.

This is evidence against a global coding-style overlay, not evidence against
all scoped prose guidance. Keep the KRN skill explicit-only and keep global
`config/AGENTS.md` unchanged. The raw fixtures, JSONL, diffs, and technical
summary remain outside the canonical repository at:

`/mnt/storage/coding/krn/agent-style-pilot-v2/`

The durable conclusion is still `lab-test`: a future prose-only pilot needs
human preference and semantic-preservation review before any promotion.

## Strong-overlay falsifier

A second exploratory run on 2026-08-24 tested a stronger KRN/Fabien-style
overlay with coding rules for constants, control flow, comments, test-first
work, API boundaries, and concise reports. It used the same six-task pair design
and 12 fresh `gpt-5.6-sol` runs.

All visible code tests passed, but independent probes found behavior changes
outside those tests. The overlay's `formatBytes` implementation truncated the
unit list, changing `1024 ** 7` from `1 ZiB` to `1024 EiB`. Its `parseHostPort`
implementation also collapsed distinct malformed-input errors into one error
type. On prose, it sometimes improved scanability but also added unnecessary
headings to a short README; another release-note result was identical.

This falsifies the broad coding-style overlay as a safe global `AGENTS.md`
change. Keep the global contract unchanged. `$unslop` remains an explicit,
prose-scoped lab-test; any future promotion needs a human preference study with
semantic-preservation checks.
