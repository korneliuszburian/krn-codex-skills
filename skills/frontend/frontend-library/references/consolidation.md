# Consolidation — identify, group, reevaluate, condense

Detail and evidence for the consolidation workflow. Goal: one canonical implementation per job, zero duplicates, everything traceable to tokens.

## Why consolidation is necessary (evidence)
- GOV.UK (2018): before the fix, the biggest frontend applications duplicated breadcrumbs, search boxes, and templates with no single source, because patterns were undocumented — "confused developers and designers, and made it slower to iterate designs". Fix: convert patterns into components + a component guide with `component_principles.md` / `component_conventions.md`; never re-implement a pattern that already exists in the library.
  Source: https://insidegovuk.blog.gov.uk/2018/02/15/creating-tools-to-ensure-a-consistent-frontend-on-gov-uk/
- Complete CSS lesson 057: append-only codebases — "people just add code to it, rather than use what is already there" — are the maintenance failure mode; the countermeasure is documented patterns and extraction.
  Source: research/sources/complete-css/057
- Shopify Polaris (2022): components used in 70% of the admin but tokens covered only 44% — teams hardcoded or forked components; global changes became "infinitely challenging and costly". Fix: one token source, one format, one doc page.
  Source: https://medium.com/shopify-ux/putting-the-system-back-in-our-design-system-b2c55a392dea

## Identification checklist (scan order)
1. Raw values where tokens exist (hex/px literals outside the token layer).
2. Local knockoffs of library primitives: hand-rolled `.wrapper`, `.cluster`, `.grid`, `.flow`, `.repel`, button styles, visually-hidden hacks.
3. Component duplicates: two blocks doing the same job under different names.
4. The same treatment implemented 3+ times in separate blocks (extract utility candidate).
5. Layout declarations inside blocks (move to compositions in markup).
6. Class-based variants/stacked modifiers (convert to `[data-*]` exceptions).
7. Dead CSS: rules whose selectors match no markup (remove; git history keeps the record).

## Grouping by layer (CUBE decision tree)
- Spatial relations → composition class (library compositions).
- One-job repeatable tweak → utility (library utilities; new one if 3+ repetitions and no library file covers it).
- Component skeleton with context-only styles → block (library pattern: knobs + `[data-*]` exceptions + `__element` internals).
- Variant/state → `[data-*]` exception on the existing block.
- Site-wide default → global CSS (`:not([class])` scoping).
- Fits nowhere / browser default → delete it.

## Condensation order (per finding)
1. Replace with the library file verbatim; re-point markup to the canonical class names.
2. Delete the local implementation.
3. Tokenize remaining literals.
4. If a new utility/block was extracted: document it in the pattern library with its config custom properties (file-header comment + pattern-library entry — no self-documenting code).

## Reuse rules that follow from the library
- `.hero` configures switcher + frame; `.media-content` configures sidebar + frame; `.site-head`/`.site-foot` configure repel + cluster; `.buttons` configures cluster; `.cta`/`.prose` configure flow-style spacing. When building a new block: configure compositions the same way — a block's layout work is custom-property configuration, never bespoke layout CSS.
- New blocks must follow the library idiom: token defaults on every knob, `[data-*]` exceptions, `__element` internals, no layout.
