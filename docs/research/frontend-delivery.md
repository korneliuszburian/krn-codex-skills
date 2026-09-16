# Frontend delivery synthesis

Status: `accepted`. Consumer: `$frontend-architecture` and the maintainer. Owner: maintainer.
Verified: 2026-09-16. This page is the A-to-Z logic the frontend stage
follows: how a design becomes a frozen architecture, how size and layout are
derived, and how finished work is never redone. Sources are primary (cube.fyi,
piccalil.li, every-layout, set.studio) plus the locally held Complete CSS course,
the `frontend-vault` corpus, and code evidence from `boilerplate-rekurencja` and
the Bloom Barista exemplar.

## The model

CUBE CSS is `C`omposition, `U`tility, `B`lock, `E`xception, applied global-first:
style globally and high up, add contextual deviations last. The browser is
**hinted, not micromanaged**; progressive enhancement is the baseline, not a
fallback (cube.fyi/principles). The goal is the smallest CSS that covers the most
contexts; abstraction only when a repeat is real.

## Size comes from structure, never from a height

- A fixed or explicit section height is wrong because content length is unknown
  ahead of time; use intrinsic sizing (every-layout: content-driven height).
- Vertical rhythm is `.flow` (`margin-block-start: var(--flow-space, 1em)` on
  siblings), not margins on each element (cube.fyi/composition).
- Section spacing is block padding: `.region { padding-block: var(--region-space,
  var(--space-xl-2xl)) }`; a section grows by padding + content, never by height.
- Width is the wrapper's job (`min(100% - 2*gutter, var(--wrapper-max-width))`), a
  fluid clamp, not a fixed box.
- Responsiveness comes from intrinsic tracks (`repeat(auto-fill,
  minmax(var(--grid-min-item-size), 1fr))`) and `flex-basis` thresholds, so most
  layouts need no media query.
- Media size comes from `aspect-ratio` (`.frame`) so space is reserved before load.
- The only sanctioned floor is a deliberate `min-block-size` on the cover/hero
  pattern (every-layout "Cover": `min-block-size: 100vh` plus `margin-block:auto`),
  and `body { min-height: 100vh }` for the sticky-footer grid — both are structure,
  not styling, and both are exceptions.
- Consequences enforced here: no `min-height`/`min-block-size` on a block for
  appearance, no height on a section, no space token used as a height. A block owns
  no external layout: no own margin, width, or outer flex/grid.

## Composition set (one job each)

`flow` vertical rhythm · `grid` auto columns · `cluster` wrapping inline group ·
`repel` two items pushed apart · `sidebar` companion + fluid main · `switcher`
two-up until a container threshold · `wrapper` measure cap · `frame` media crop ·
`reel` horizontal scroll · `breakout` full-bleed width. Compositions own spatial
relations only (never `background`, `color`, `font-*`), are configured through
custom properties **in context**, and are never forked; a layout variant is a
`data-*` exception that re-points the same custom properties. Nesting compositions
is normal; re-implementing one inside a block is not.

## Block quality bar

A block is a thin skeleton: most work is already done globally. Target ≤ ~80–100
lines; if it grows, split it or move the part up to a composition/utility. It
composes with composition classes for its internals, exposes every presentational
property as `var(--knob, default-token)`, and never duplicates. It documents its
knobs. One `.button` for the whole project; no per-context button clones. States
that the browser owns (`:disabled`) use the native selector, not a `data-state`.

## Tokens

Two tiers: raw scale/palette tokens, then semantic aliases (`--text-size-heading-1:
var(--size-step-5)`); components consume the semantic layer only, as
`var(--x, var(--token))`. Fluid type and space are one scale of `clamp()` steps
generated from min/max values (Utopia-style), not a bespoke clamp per element and
not breakpoint-switched font sizes. Theming re-aliases the semantic layer; it does
not restyle components. Contrast is a property of the token pair.

## Exceptions (variants)

A variant is a `data-*` attribute that re-points 2–4 existing knobs; it declares no
new properties and never new classes. If a variant makes the block
unrecognisable, make a new block instead of stretching the exception. Variant
values are layout-shaped (`primary|secondary`, `left|right`), not design-shaped.

## Duplication and rework (the reason this stage exists)

- Copy the canonical library **verbatim**; never paraphrase, rename, or keep a
  local knockoff. Configure a library block in project context, never by editing it.
- Before authoring anything, check existing blocks and their variants; a repeat
  that differs only by layout, presence, or scale is a **variant**, not a block.
- Undocumented patterns cause duplication (GOV.UK's duplicated breadcrumbs);
  the fix is "never re-implement an existing pattern".
- A `verified` block is frozen: changing it needs a new acceptance criterion and a
  falsifier. This is the rule that stops paying twice for the same component.

## Process (forced, with exit criteria)

Plan (no code; review the design for oversights and agree fluid tokens) → disposable
prototype only for a risky layout (junk CSS allowed, never promoted) → HTML-first
whole page → tokens + global CSS (a kitchen-sink page of every element looks right
with zero block CSS) → compositions → utilities → core blocks → exceptions →
markup-only page composition (no new block CSS) → flair pass → verify → document.
The design process is content-first (priority guides) and prototypes in the
browser, not Figma.

## Enforcement

Stylelint as the mechanical floor (`maxWarnings: 0`, `reportDisables: true`):
banned hex/named colors, `unit-allowed-list`, `declaration-property-value-disallowed-list`,
`custom-property-pattern`, `declaration-no-important`, `selector-max-id: 0`,
`selector-max-specificity`, physical-property ban, and a `font-size` allowlist that
requires a token. Browser evidence is the per-block acceptance check. The stage adds
the project-level rules the general lint does not: no section height, no
appearance `min-height`/`min-block-size`, one library implementation per job.

## Anti-patterns to reject on sight

A block owning its layout (`.card { margin; width }`); breakpoint-locked type; magic
numbers without a derivation comment; utility chains instead of a block; a
framework preflight competing with the reset; hardcoded design values drifting
per block; variant sprawl and invented variant values; duplicating a component
instead of finding it; pixel-perfect Figma chasing.

## Stage artifacts

The stage writes facts, not prose: `docs/design/raw/` (raw MCP dumps),
`tokens.md` (every value, its snapped token, deviations), `sections.md` (every
section of every page with counts), `components.md` (block × variant × optionals),
and `blocks.md` (per-block `planned` → `built` → `verified`). The first fixture is
the Complete CSS Bloom Barista design: a small canonical file whose sections are
Hero, Courses, About, Blog, Footer at two widths, with essentially no published
variables — so the token source is the project design system, and the tooling must
read frames, not only component instances.

## Residual bounds

The primary course transcripts were not in this checkout when the vault synthesis
ran, so course rules are quoted from the vault's own standards pages. Every-layout
bodies are paywalled beyond the Cover snapshot. The height rule is a project policy
drawn from the sources above, not a verbatim single-source rule.
