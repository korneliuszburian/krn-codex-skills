# Consolidation rules — blocks, variants, optionals

One block covers many near-identical sections. The matrix decides the mapping, and
it is recorded before any code.

## Decision order

1. **Reuse** — an existing library block (or one of its variants) already matches.
   Never duplicate it.
2. **Extend** — the shape matches but a property differs. Add a variant or an
   optional to the existing block; do not fork.
3. **Author** — genuinely new semantics (no library block plausibly covers it).
   The bar is high; prefer extend.

## What makes it a variant (not a new block)

A difference is a variant when the block's *semantics* hold and only one axis
changes:

- **layout** — media left vs media right, stacked vs split;
- **presentation** — does an element exist (eyebrow, button, media);
- **scale** — heading level H1–H6, measure;
- **state** — hover, active, expanded.

A difference is a **new block** only when the content contract differs — a
different set of fields with a different meaning (e.g. an accordion vs a text
block).

## Matrix format (`docs/design/components.md`)

| Block | Variant (`data-*`) | Optionals | Occurrences | Library file |
|---|---|---|---|---|
| media-content | `data-media-position="left\|right"` | — | 45 / 43 | `library/css/blocks/media-content.css` |
| text | `data-variant` / `data-measure` | eyebrow, heading H1–H6, button | 73 | `library/css/blocks/text.css` |
| hero | `data-variant="primary\|secondary"` | media, button | 15 | `library/css/blocks/hero.css` |

## Naming

- Block names describe the content contract (`text`, `media-content`, `hero`,
  `cta`), not the design layer name and not the page.
- A variant value is lower-case and layout-shaped (`primary`, `secondary`,
  `left`, `right`), not design-shaped (`green`, `big`).

## Exit

Every section in `sections.md` maps to exactly one matrix row. Any section that
does not is either a mistake or a genuinely new block — decide which, explicitly.
