---
name: frontend-components
description: Implement CUBE blocks as thin skeletons — composition-based internals, custom-property knobs, and data-attribute variants. Use for a new component, a restyle, naming, or composing from existing patterns; skip design intake, tokens, and lint setup.
---

# Blocks — thin skeletal components

A block is a skeletal component. Most work is already done by global CSS, compositions, and utilities; block CSS stays tiny and contextual.

## <required> — before writing a block

1. Compose from the smallest existing pieces. IF an existing block/atom/molecule covers the need THEN reuse it (check variants first). NEVER create a duplicate component.
2. Resolve the project's core through `$frontend-library`. IF its resolved core contains the needed block THEN reuse that project-selected file VERBATIM. The snippets below are the pattern; the resolved core is the implementation.
3. IF a new block is needed THEN build its internals with composition classes, not hand-rolled layout.
4. Check the existing naming convention for block internals and use it consistently.
5. IF the project has no pattern inventory THEN the new block must be documented (file header + pattern library entry).

## Rules

### The skeleton contract
- IF styles apply only in the component's own context THEN they go in the block. NEVER restyle in a block what global CSS, a composition, or a utility already covers.
- GOOD: `.prose { --flow-space: var(--space-l) }` — one line configuring the flow composition / BAD: a 400-line `.card` with its own grid and margins.
- Line count is a review signal, never a split trigger or code budget. IF a block
  grows THEN inspect it for a second contextual responsibility, duplicated rules,
  or a reusable composition/utility; move only the responsibility with an earned
  owner. A cohesive block may exceed 100 lines when splitting it would scatter
  one component contract or manufacture abstractions without another consumer.
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
- IF an attribute is shared vocabulary declared by the resolved core (`data-alignment`, `data-layout`, `data-measure`, `data-media-position`, …) THEN use it unprefixed. IF it is a block-local exception THEN prefix it with the block name. NEVER invent a new unprefixed attribute — `krn-codex frontend audit` reports `variant-naming`.
- IF a `-variant` value is needed THEN it must already exist in the theme or resolved core (`[data-button-variant='link']`). NEVER pass a value the design never defined; the default is expressed by omitting the attribute (e.g. the default button carries no `data-button-variant`). `frontend audit` reports `template-variant` for an undefined value.
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

### One file, one block
- IF a block file styles an element of another block THEN that is a duplicate. Move the styles to the owner's file, or configure the owner's knobs from a selector that starts with your own block class.
- GOOD: `.courses .button { --button-bg: var(--color-light); }` (context config) / BAD: `.card__media { aspect-ratio: 1 / 1; }` inside `courses.css` — `krn-codex frontend audit` reports `block-ownership`.
- IF a block's styles live in a section file because "the section is the only consumer" THEN it is still a duplicate. NEVER mark the block `built` in the registry until `src/css/blocks/<slug>.css` exists (`frontend audit --docs` reports `facts-registry`).

## Scope and structure
- IF a component is used in one domain only THEN keep it next to that domain; promote to shared UI only on a second unrelated consumer.
- IF importing a shared component THEN use its public entry point. NEVER deep imports of internals.
- NEVER put business logic, routing, API calls, or analytics inside primitives — pages orchestrate, primitives render.
- IF you debate atom-vs-molecule THEN use the project's own vocabulary and move on. NEVER block work on taxonomy debates.

## Final checklist
- [ ] Block is a cohesive thin skeleton extending global/composition/utility; any
      extracted rule has an earned owner and consumer
- [ ] Internals use composition classes
- [ ] Every presentational property is a `var(--x, default)` knob
- [ ] No variant class names, no duplicate components, no other block's classes in this file
- [ ] Semantic elements; defensive constraints on content
- [ ] Class attribute grouped in the project's order
- [ ] `npm run frontend:audit` (or `krn-codex frontend audit`) passes; every `--accept` has a recorded reason

## References
- [references/blocks.md](references/blocks.md) — block anatomy, naming conventions, grouping rules, and atomic-mapping notes with sources.
