---
name: frontend-components
description: Implement CUBE blocks as thin skeletons — composition-based internals, custom-property knobs, and data-attribute variants. Use for a new component, a restyle, naming, or composing from existing patterns; skip design intake, tokens, and lint setup.
---

# Blocks — thin skeletal components

A block is a skeletal component. Most work is already done by global CSS, compositions, and utilities; block CSS stays tiny and contextual.

## <required> — before writing a block

1. Compose from the smallest existing pieces. IF an existing block/atom/molecule covers the need THEN reuse it (check variants first). NEVER create a duplicate component.
2. IF the canonical library exists THEN copy the needed block file VERBATIM from `.agents/skills/frontend-library/library/css/blocks/` (button, buttons, cta, hero, text, media-content, site-head, site-foot, prose). NEVER paraphrase or re-implement it — the snippets below are the pattern, the library is the implementation.
3. IF a new block is needed THEN build its internals with composition classes, not hand-rolled layout.
4. Check the existing naming convention for block internals and use it consistently.
5. IF the project has no pattern inventory THEN the new block must be documented (file header + pattern library entry).

## Rules

### The skeleton contract
- IF styles apply only in the component's own context THEN they go in the block. NEVER restyle in a block what global CSS, a composition, or a utility already covers.
- GOOD: `.prose { --flow-space: var(--space-l) }` — one line configuring the flow composition / BAD: a 400-line `.card` with its own grid and margins.
- IF a block exceeds ~80–100 lines THEN split it or move parts up to global/composition/utility.
- NEVER solve two distinct components in one block file.

### Naming and grouping
- IF you name block internals THEN pick one convention (BEM-lite `card__content` preferred) and use it across the project. NEVER mix conventions (BEM in one block, element selectors in another).
- IF an element carries multiple CUBE classes THEN order the class attribute: block → other blocks → utilities → token utilities, delimited consistently.
- GOOD: `class="card | section box | bg-base color-primary"` / BAD: `class="bg-base card flow"` on one element and a different order on the next.
- NEVER duplicate a pattern that already exists in the project (undocumented patterns cause exactly this — document each new block).

### Configurable knobs
- IF a block is likely to vary (size, color, padding, focus) THEN expose knobs as custom properties with semantic-token defaults.
- NEVER re-declare full property sets per variant. NEVER invent per-variant padding/typography tokens when the knobs exist.
- GOOD: `.button { background: var(--button-bg, var(--color-dark)); padding: var(--button-padding, var(--space-xs) var(--space-s)); }` + context config `.hero .button { --button-bg: var(--color-light); --button-color: var(--color-primary); }` / BAD: `.button--secondary { background: #222; ... }` duplicating 20 lines, or `--button-padding-y`/`--button-padding-x` per variant.
- IF a variant is truly needed THEN one `data-<block>-variant` value per real design need (e.g. `data-button-variant='link'`). NEVER invent variant values (secondary/inverted/small) the design did not define — express those as knob config in context.
- IF the design is silent on colors/fonts THEN reuse project tokens or a minimal neutral default. NEVER invent a palette or typography system beyond the spec.

### The shared button block
- IF the project has a `.button` block THEN use it everywhere. NEVER create component-specific button clones (`.card__button`).
- Copy this pattern for any button (exact knob vocabulary, no per-axis tokens):

```css
.button {
  --button-bg: var(--color-primary);
  --button-color: var(--color-light);
  --button-hover-bg: var(--color-dark);
  --button-hover-color: var(--color-light);
  --button-border-width: var(--stroke, 1px);
  --button-border-style: solid;
  --button-border-color: transparent;
  --button-radius: var(--radius-m, 0.75rem);
  --button-padding: var(--space-xs) var(--space-s);
  display: inline-flex;
  align-items: center;
  gap: var(--button-gap, 0.5em);
  padding: var(--button-padding);
  background: var(--button-bg);
  color: var(--button-color);
  border-width: var(--button-border-width);
  border-style: var(--button-border-style);
  border-color: var(--button-border-color);
  border-radius: var(--button-radius);
  font-size: var(--button-font-size, 1em);
  font-weight: var(--button-font-weight, 700);
  line-height: 1.1;
  text-decoration: none;
  cursor: pointer;
}
.button:hover { background: var(--button-hover-bg); color: var(--button-hover-color); }
.button[data-button-variant='link'] {
  --button-bg: transparent;
  --button-border-color: currentColor;
  --button-border-width: 0 0 var(--stroke, 1px);
  --button-color: currentColor;
  --button-padding: 0 0 var(--space-3xs, 0.25rem);
}
.button[data-button-has-icon] { gap: var(--space-2xs, 0.5rem); }
.button__icon { flex: none; height: var(--button-icon-size, 1.2cap); }
.button__label { font-size: var(--button-font-size, var(--size-step-00, 1rem)); }
```

- NEVER split `--button-padding` into per-axis or per-variant tokens (`--button-padding-y`, `--button-small-padding-block`). One knob, one shorthand.
- NEVER unprefixed exception attributes — `data-button-variant`, `data-button-has-icon` (block name in the attribute).
- IF a variant exists THEN it sets 2–4 existing knobs ONLY. NEVER declare new CSS properties in a variant.
- IF the variant is a size change THEN override `--button-font-size`/`--button-padding` knobs in the same attribute. NEVER a separate padding token pair.
- Disabled = native `disabled` attribute / `:disabled`. NEVER a data-state.
- IF the design is silent on colors/fonts THEN reuse project tokens or minimal neutral defaults. NEVER invent a palette or typography system beyond the spec.
- GOOD: `<a class="button" data-button-variant="link" data-button-has-icon><span class="button__icon" aria-hidden="true">…</span><span class="button__label">Label</span></a>` / BAD: `<div class="card__button">…`.

### Composition inside blocks
- IF a block contains a group of flow/laid-out children THEN give the inner wrapper a composition class.
- NEVER hand-roll internal flex/grid/margins when a composition exists.
- Layout boundary: a block NEVER owns EXTERNAL layout (its own margin, width, outer flex/grid — the parent context decides). Internal structure (padding, inner flow/gap configuration via knobs) is fine — that is what the library blocks do.
- GOOD: `<div class="card__content flow">` / BAD: `.card__content { display: flex; flex-direction: column; gap: 1rem }`.

### Defensive and semantic
- IF content can arrive longer/taller/differently sized than designed THEN constrain it defensively (aspect-ratio, min/max, overflow-wrap, hyphens).
- NEVER assume content matches the mock exactly.
- IF a control triggers an interaction THEN `<button class="button">`; IF it navigates THEN `<a class="button">`. NEVER divs/spans with click handlers.
- IF content breaks a component THEN fix the component. NEVER a one-off override on the page instance.
- IF creating a primitive THEN include focus/keyboard/ARIA/states in the primitive itself. NEVER add accessibility as a page-level afterthought.

### Scope and structure
- IF a component is used in one domain only THEN keep it next to that domain; promote to shared UI only on a second unrelated consumer.
- IF importing a shared component THEN use its public entry point. NEVER deep imports of internals.
- NEVER put business logic, routing, API calls, or analytics inside primitives — pages orchestrate, primitives render.
- IF you debate atom-vs-molecule THEN use the project's own vocabulary and move on. NEVER block work on taxonomy debates.

## Final checklist
- [ ] Block is a thin skeleton (≤ ~100 lines) extending global/composition/utility
- [ ] Internals use composition classes
- [ ] Every presentational property is a `var(--x, default)` knob
- [ ] No variant class names, no duplicate components
- [ ] Semantic elements; defensive constraints on content
- [ ] Class attribute grouped in the project's order

## References
- [references/blocks.md](references/blocks.md) — block anatomy, naming conventions, grouping rules, and atomic-mapping notes with sources.
