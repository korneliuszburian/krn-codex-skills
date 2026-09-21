---
name: frontend-library
description: The canonical CUBE CSS library (compositions, utilities, blocks, global CSS, design tokens) to copy verbatim when starting a project's CSS, consolidating duplicated components, or auditing code against it. Use for the library itself; skip design intake and lint setup.
---

# Frontend library — verified snapshot of the canonical CUBE core

`library/` is a generated, checked-in consumer of the Rekurencja boilerplate's
canonical frontend-core export. `library-manifest.json` pins its source revision,
upstream provenance, complete path set and per-file digests. Never edit the
snapshot by hand; only `krn-frontend-library import` may replace it after the
source bundle verifies. A created project's own pinned manifest remains its
authority when its core revision differs from this snapshot.

## <required> — before writing any CSS

1. IF creating a new project THEN use the boilerplate's executable profile; do not assemble a project from this skill. IF working in an existing project THEN resolve its recorded frontend-core manifest first. IF that identity matches `library-manifest.json` and a needed composition, utility, block, global file, or token set exists in `library/` THEN copy the file(s) VERBATIM. NEVER paraphrase, rewrite, "simplify", or rename the core code. (Disposable prototypes are exempt.)
2. IF the project already contains a local implementation of any library primitive (e.g. a hand-rolled `.wrapper`, `.cluster`, or button) THEN replace it with the library version and re-point the markup. NEVER keep two implementations of the same job.
3. IF a library block needs project-specific values THEN configure its custom properties in the project context — never edit the library file itself.
4. IF the project already contains a file with a library name (`.text`, `.hero`, a composition) THEN diff it against `library/css/…` before trusting it: a drifted local copy is not the library. Re-point the project to the library copy, or record the deviation in the project's facts docs. NEVER call a file "verbatim" without diffing it — the harness audit reads the library's own vocabulary, so drift shows up as invented variants.
5. IF you audit existing CSS THEN use the library as the reference implementation for the audit rules (`krn-codex frontend audit`): the shared `data-*` vocabulary and a block's variant values are read from these files.

## Library map

| Path (under `library/css/`) | What it is | Config custom properties |
|---|---|---|
| `global/reset.css` | Modern reset (Piccalilli's "A more modern CSS reset"), incl. `prefers-reduced-motion` kill-switch | — |
| `global/global-styles.css` | Global element styles: headings, measure caps, forms, `:focus-visible`, `::selection`, `.skip-link`, `.lede` | token-driven |
| `global/variables.css` | `:root` variables: `--gutter`, `--wrapper-max-width`, `--measure`, `--radius-*`, `--stroke`, `--text-size-*`, `--kerning-*`, `--transition-*`, `--leading-*` | — |
| `global/fonts.css` | `@font-face` declarations | — |
| `compositions/flow.css` | Vertical rhythm: `.flow > * + * { margin-top: var(--flow-space, 1em) }` | `--flow-space` |
| `compositions/grid.css` | Auto-fill grid, no media queries | `--grid-placement`, `--grid-min-item-size`, `--gutter`; exceptions `[data-layout='halves']`, `[data-layout='thirds']` |
| `compositions/cluster.css` | Wrapping inline group | `--cluster-horizontal-alignment`, `--cluster-vertical-alignment`, `--gutter` |
| `compositions/repel.css` | Two items pushed apart | `--repel-vertical-alignment`, `--gutter`; exception `[data-nowrap]` |
| `compositions/sidebar.css` | Companion column + fluid main | `--sidebar-target-width`, `--sidebar-content-min-width`, `--gutter`; exception `[data-direction='rtl']` |
| `compositions/switcher.css` | 2 items row↔stack at a container threshold | `--switcher-target-container-width`, `--switcher-vertical-alignment`, `--gutter`; max 2 items, 3rd+ full width |
| `compositions/wrapper.css` | Measure/page gutter wrapper | `--wrapper-max-width`, `--gutter` |
| `compositions/reel.css` | Horizontal overflow rows with scroll-snap | `--reel-item-width`, `--gutter` |
| `compositions/frame.css` | Media crop preserving intrinsic sizing | `--frame-ratio` (default 16/9) |
| `compositions/breakout.css` | Full-bleed escape from the wrapper (uses `cqw` with `@supports`) | — |
| `utilities/region.css` | Section padding | `--region-space` (default `--space-xl-2xl`) |
| `utilities/visually-hidden.css` | Screen-reader-only text | — |
| `blocks/prose.css` | Long-form content spacing/measure | `--prose-space`, `--prose-heading-space`, `--prose-heading-follow-space`, `--prose-paragraph-space` |
| `blocks/button.css` | The button: knobs + `[data-button-variant='link']` + `[data-button-has-icon]` + `__icon`/`__label` | `--button-bg`, `--button-color`, `--button-border-*`, `--button-radius`, `--button-padding`, `--button-font-*`, `--button-icon-size` |
| `blocks/buttons.css` | Button group: `.buttons { --gutter: var(--space-xs) }` + `[data-alignment='center']` | via cluster knobs |
| `blocks/cta.css` | Call-to-action section | `--flow-space` |
| `blocks/hero.css` | Hero: switcher layout + media frame + eyebrow | `--gutter`, `--switcher-target-container-width`, `--flow-space` |
| `blocks/text.css` | Text block with eyebrow/heading/content knob exceptions | `[data-eyebrow-*]`, `[data-heading-*]`, `[data-content-*]`, `[data-alignment='center']`, `[data-measure='standard']`, `[data-layout='split']` |
| `blocks/media-content.css` | Media + text via sidebar/frame | `[data-media-position='right']`, `--frame-ratio` |
| `blocks/site-head.css` | Header: `__inner` configures repel, nav cluster, `[aria-current='page']` | `--gutter`, `--repel-vertical-alignment` |
| `blocks/site-foot.css` | Footer: repel + cluster, `[aria-current='page']` | as site-head |
| `blocks/recursive-grid.css` | Optional visual treatment for the recursive-grid canvas | token-driven |
| `design-tokens/*.json` + `tokens.resolver.json` | DTCG token source (colors, spacing, sizes, leading, weights, fonts, viewports) | — |

Import order: reset → global-styles → variables → fonts → compositions → utilities → blocks.

## Consolidation workflow — identify, group, reevaluate, condense

Run this when an existing codebase has scattered or duplicated components.

1. IDENTIFY: list (a) the same treatment implemented in 3+ places, (b) components that duplicate a library block, (c) local knockoffs of library primitives (hand-rolled `.wrapper`/`.cluster`/`.grid`/button), (d) raw values where tokens exist.
2. GROUP: sort findings by layer — layout → compositions; one-job tweaks → utilities; context skeletons → blocks; variants/states → data-attribute exceptions.
3. REEVALUATE: per finding, ask in order: does a library file already cover it? (replace and re-point markup) → does the same rule repeat 3+ times? (extract a one-job utility with knobs) → is it a component with context-only styles? (library-pattern block) → is it a variant of an existing block? (`[data-*]` exception). NEVER abstract a one-off; NEVER create a duplicate.
   - IF you find modifier classes during consolidation (`.badge--new`, `.card--feature`) THEN convert them to data-attribute exceptions (`.badge[data-badge-variant='new']`).
4. CONDENSE: replace duplicates with the canonical class/file; delete local knockoffs; re-point markup; tokenize leftover values; document new patterns. NEVER keep two implementations of the same job.

Evidence: GOV.UK — undocumented patterns led to duplicated breadcrumbs/search boxes/templates; the fix was one component guide and "never re-implement an existing pattern". Complete CSS lesson 057: people add code rather than use what is already there. cube.fyi: abstraction only on real repetition; lesson 019: slice into the smallest reusable pieces.

## NEVER
- NEVER paraphrase, rewrite, rename, or "improve" library code — copy verbatim.
- NEVER keep a local knockoff when the library primitive exists.
- NEVER edit a library file for a project-specific value — configure custom properties in context.
- NEVER add a new primitive to the project before checking `library/` covers it.
- NEVER invent new block/utility names for what an existing block + `[data-*]` exception already expresses.

## Final checklist
- [ ] Every composition/utility/block in the project matches `library/` verbatim
- [ ] Zero local knockoffs of library primitives
- [ ] Duplicates consolidated; markup re-pointed to canonical classes
- [ ] Project-specific values configured via custom properties, not file edits
- [ ] Tokens consumed from `design-tokens/` via the resolver

## References

- [references/consolidation.md](references/consolidation.md) — identification, grouping, and condensation detail with sources.
- `library-manifest.json` — generated source identity and digest contract.
- `library/` — generated bytes from the manifest's `css/` and `design-tokens/` path set.
