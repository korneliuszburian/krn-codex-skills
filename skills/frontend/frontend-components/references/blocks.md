# Blocks — detail

## Button anatomy (the canonical pattern)
From Andy Bell's "How I build a button component" + the rekurencja boilerplate (`blocks/button.css`):

```css
.button {
  /* Configuration (knobs with semantic-token defaults) */
  --button-bg: var(--color-dark);
  --button-border-color: transparent;
  --button-border-width: var(--stroke);
  --button-border-style: solid;
  --button-radius: var(--radius-m);
  --button-color: var(--color-light);
  --button-font-weight: var(--font-weight-bold);
  --button-line-height: var(--leading-fine);
  --button-padding: var(--space-xs) var(--space-s);

  display: inline-flex;             /* inline-flex/inline-block — never block/flex */
  align-items: center;
  gap: var(--button-gap, 0.5em);
  padding: var(--button-padding);
  background: var(--button-bg);
  color: var(--button-color);
  border-width: var(--button-border-width);
  border-style: var(--button-border-style);
  border-color: var(--button-border-color);
  border-radius: var(--button-radius);
  text-decoration: none;
  font-weight: var(--button-font-weight);
  line-height: var(--button-line-height);
  cursor: pointer;
}

/* The one real variant: link-style. primary is the DEFAULT (no data-attribute). */
.button[data-button-variant='link'] {
  --button-bg: transparent;
  --button-border-color: currentColor;
  --button-border-width: 0 0 var(--stroke);
  --button-color: currentColor;
  --button-font-weight: var(--font-weight-regular);
  --button-padding: 0 0 var(--space-3xs);
}

/* Icon support is standard, not a variant */
.button[data-button-has-icon] { gap: var(--space-2xs); }
.button__icon { flex: none; height: var(--button-icon-size, var(--space-2xs)); }
.button__label { font-size: var(--button-font-size, var(--size-step-00)); }

/* Context config: variants by context, not by new classes */
.hero .button { --button-bg: var(--color-light); --button-color: var(--color-primary); }
```

Rules distilled:
- Always set a border value (UA styles + solid-vs-ghost equal heights). Break `border` into longhand properties for per-part configurability.
- `inline-flex`/`inline-block`, never `block`/`flex` — compositions control the rest.
- Hover needs an explicit `--button-hover-color` (contrast guarantee per variant); focus outline falls back to border vars with `calc(var(--button-border-width) * 2)` offset; `:active { transform: scale(99%) }` for the pressed state.
- Icon SVG: `aria-hidden="true"` + `width`/`height` attributes (no-CSS fallback); CSS size in `em`/`cap` so icons scale with text.
- `:disabled` / `[disabled]` is the disabled state — never a data-state.
- `<button class="button">` for interactions, `<a class="button">` for navigation.
- Markup: `class="button"` + `data-button-variant="…"` (values: `primary` (default, no attribute needed in the boilerplate's whitelist logic) / `link`) + `data-button-has-icon` + `span.button__icon[aria-hidden]` + `span.button__label`.
Sources: https://piccalil.li/blog/how-i-build-a-button-component/ (2024-09); rekurencja boilerplate `src/css/blocks/button.css` + `components/button/template.php`.

## Block skeleton contract
- "A block is a skeletal component or organisational structure" — most of the work is already done by global CSS, compositions and utilities, so block CSS stays tiny.
- "It shouldn't grow to anything larger than a handful of CSS rules (max 80-100 lines)" and must not "solve more than one contextual problem".
- Block internals: "approach the internals of your block with a composition layer" — `.card__content flow`, never hand-rolled internal layout.
- Sources: https://cube.fyi/block.html ; course lessons 010/032/036/037 (research/sources/complete-css/).

## Naming internals
- BEM's `__` element syntax "doesn't have to apply"; `.my-block .image`, element selectors, or BEM-lite all work — "the important thing is consistency". Bell personally prefers BEM-lite (`card__content`).
- Source: https://cube.fyi/block.html ; course lesson 010.

## Class-attribute grouping
- Order: 1) primary block class, 2) subsequent block classes, 3) standard utilities, 4) design-token utilities. Delimiters (brackets or pipes) optional but consistent.
- `class="[ card ] [ section box ] [ bg-base color-primary ]"` or `class="card | section box | bg-base color-primary"`.
- Source: https://cube.fyi/grouping.html

## Button anatomy (course lesson 036)
The course's early button shows the same principle in simplified form — variants change variables only, "we're done", no new CSS. The canonical production pattern (knob naming, icon support, link variant, context config) is the section at the top of this file; prefer it over the course's simplified sketch. `<button class="button">` triggers interactions; `<a class="button">` navigates; never `<div>` buttons.

## Atomic Design mapping (what survives criticism)
- Compose from the smallest existing pieces; create new only when nothing existing covers the need.
- Real content breaks components → fix the component, never the page instance. Verify empty/long/many states with real content.
- Tokens are subatomic (below atoms); atoms carry no business logic ("pages orchestrate, primitives render").
- Taxonomy is not a dependency boundary: folder names don't stop `atoms/Button` importing `features/checkout`. Public entry points only.
- Labels were never the point (Frost, 2016/2019/2025): never block work on atom-vs-molecule debates.
- Sources: https://atomicdesign.bradfrost.com/chapter-2/ ; https://bradfrost.com/blog/post/extending-atomic-design/ ; https://www.qt.io/software-insights/atomic-design-systems-why-the-labels-dont-matter ; https://feature-sliced.design/blog/atomic-design-architecture ; https://sparkbox.com/foundry/iterating_on_atomic_design

## Duplication evidence
- GOV.UK's biggest frontend applications duplicated breadcrumbs, search boxes and templates because patterns were undocumented. Fix: component guide + principles/conventions files + "never re-implement an existing pattern".
- Source: https://insidegovuk.blog.gov.uk/2018/02/15/creating-tools-to-ensure-a-consistent-frontend-on-gov-uk/
