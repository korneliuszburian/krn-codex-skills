---
name: frontend-architecture
description: Plan a site from a design before writing code — snap design values to tokens, inventory every section, consolidate repeats into blocks and variants, map ACF Flexible Content fields, and freeze a build plan. Use at design intake; skip implementation and one-off tweaks.
---

# Frontend architecture (design → plan)

This is the early stage that decides whether a site build gets faster or slower.
Its product is a **frozen architecture and a facts file**, not CSS. Write no
component code before the phases below have an exit.

## <required> — before any component code

1. IF a design source exists THEN run Phases 0–5 in order. NEVER start component
   CSS from a raw design.
2. IF a value, section, or block already has a fact THEN reuse it; NEVER rediscover
   or re-create it.
3. IF a repeated pattern differs only by layout or content THEN it is a **variant**
   of one block, never a second block.

## Inputs

- Design source: Figma through the project MCP (`get_variable_defs`,
  `get_metadata`, `get_design_context`, `get_screenshot`) or exported frames.
- The project boilerplate: design tokens (DTCG + fluid), CUBE layers
  (`compositions`, `utilities`, `blocks`), and ACF Flexible Content layouts.
- The canonical library (copy verbatim; never paraphrase): the rekurencja CUBE CSS
  library of compositions, utilities, blocks, global CSS, and tokens.

## Phases

### Phase 0 — Intake and evidence

- Pull the design's **variables** for values and **metadata** for structure. Dump
  raw results to `docs/design/raw/` and keep them out of the chat.
- IF only screenshots exist THEN read them for layout relationships and use
  `get_screenshot` per section; treat pixel values as approximate.
- EXIT: raw variables and raw metadata exist as files.

### Phase 1 — Token inventory

- Enumerate every unique value: type sizes, line-heights, weights, families,
  colors, spacing, radii, shadows, breakpoints.
- **Snap each to the project's token scale.** NEVER adopt a raw design value as a
  new token; a one-off belongs to a component's custom property, not the scale.
- IF the scale is missing a needed step THEN derive a fluid `min`/`max` token and
  record the tolerance you accepted.
- Report deviations: values that do not fit the scale, and inconsistent designer
  choices (same role, different value).
- EXIT: `docs/design/tokens.md` lists every value, its snapped token, and every
  deviation.

### Phase 2 — Section inventory

- List every section of every page with the page count, e.g.
  `Hero (10 pages, image background)`, `Hero (5 pages, text + image right)`.
- Keep names neutral: describe the content shape, not the Figma layer name.
- EXIT: `docs/design/sections.md` names every section and its occurrence count.

### Phase 3 — Consolidation (blocks and variants)

- Cluster the sections. For each cluster decide exactly one of:
  **reuse** an existing library block (check variants first), **extend** a block
  with a variant, or **author** a new block.
- A repeated pattern that differs only by layout (media left vs right), optional
  content (eyebrow, heading, text, button), semantic heading level, or visual role
  is **one block with variants and optionals** — never N near-identical blocks.
- Prefer the smallest set: shared composition for layout, block for semantics,
  `data-*` for the variant. NEVER fork a block to change one value.
- EXIT: `docs/design/components.md` holds the **block × variant × optionals**
  matrix and every section maps to exactly one row.

### Phase 4 — ACF mapping

- For each block define its Flexible Content layout and sub-fields: optional
  eyebrow/corner, heading content, semantic heading level, independent visual
  role, rich text, button, media plus its side, and an explicit variant selector.
- Tokens govern presentation values; semantic and structural choices are finite domain options
  mapped by code. Reuse the boilerplate token-field bridge for presentation and
  NEVER expose raw CSS values in fields; do not invent fake tokens for document
  semantics or layout state.
- EXIT: every block row names its layout, fields, and which are optional.

### Phase 5 — Build plan and status

- Order the build by reuse and risk: compositions and utilities first, then the
  blocks with the highest occurrence count.
- Each block enters `docs/design/blocks.md` as `planned`; it becomes `built` when
  its code exists and `verified` when its acceptance passes (browser evidence).
- A `verified` block is **frozen**: changing it needs a new acceptance criterion
  and a falsifier, not a drive-by edit.
- EXIT: the build plan names the next block and its acceptance check.

## Anti-misread rules (the design is evidence, not truth)

- NEVER trust absolute Figma values; derive relationships (what repeats, what is
  the ratio). A badly structured file is common.
- NEVER invent a max-width, height, or spacing the design does not imply; layout
  comes from compositions, not from canvas coordinates.
- NEVER resolve a template or a value from database content.
- Flag, do not silently fix, a design inconsistency; the deviation report is the
  place for it.

## Quality bar (checked later by the build workflow and enforcement)

- Block CSS is a cohesive thin skeleton that composes `compositions` and
  `utilities`; line count is a review signal rather than a budget. Presentation
  uses tokens, variants use `data-*`, and raw magic values stay out.
- Copy the canonical library verbatim; configure a block through custom properties
  in the project context, never by editing the library file.

## References

- [references/consolidation.md](references/consolidation.md) — the block × variant
  × optionals decision rules and the matrix format.
- [references/acf-mapping.md](references/acf-mapping.md) — per-block ACF layout,
  required and optional fields, and the token-driven field rules.
- [references/facts.md](references/facts.md) — where the facts live and the freeze
  rule for a verified block.

## Grounding

CUBE CSS (Andy Bell): `C`omposition, `U`tility, `B`lock, `E`xception. Provenance
and rules distilled from the Complete CSS course and the set.studio / piccalil.li
material live in the vault; this skill is the repository-side procedure that uses
them.
