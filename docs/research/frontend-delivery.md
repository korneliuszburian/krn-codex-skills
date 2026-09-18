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

Browser evidence is the stage's only non-code gate, and it is a **measurement,
not an opinion**: `krn frontend verify --config <file>` records a
tamper-evident manifest (sha256 per artifact and per build file) with
deterministic measurements — horizontal overflow, computed height floors,
tap-target sizes, contrast offenders, grid track counts — and `--gate` re-hashes
everything, enforces the declared `expectations`, and fails closed until a human
signs the manifest (`--approve --by <name> --note <why>`). A model may run the
capture; it may never certify the result, and no row reaches `verified` without
the signature. That is the deliberate answer to browser-QA agents that report
success without evidence: the harness measures, the human decides.

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
and `blocks.md` (per-block `planned` → `built` → `verified`). The facts are
machine-checked, not trusted: `krn frontend audit --docs docs/design/blocks.md`
holds the registry to the code, and `krn frontend facts --docs docs/design`
holds the matrix, the sections, and the tokens to it. The first fixture is
the Complete CSS Bloom Barista design: a small canonical file whose sections are
Hero, Courses, About, Blog, Footer at two widths, with essentially no published
variables — so the token source is the project design system, and the tooling must
read frames, not only component instances.

## Case study: Piccalilli's Mindful Design lander (2026)

A production CUBE implementation by the CUBE author, studied read-only as the
stage's real-site reference beside the course:
https://piccalil.li/mindful-design (Astro islands; `/dist/global.css` +
`/dist/theme.css` + per-component CSS; ~398 custom properties, 76 clamps, 3
container queries, zero selector IDs).

What it confirms about this stage:

- The shared attribute vocabulary is real: `data-layout` (`halves`/`thirds` on
  the grid), `data-direction`, `data-nowrap` are unprefixed, while block-local
  exceptions are prefixed (`data-button-variant`, `data-flow-cta-variant`,
  `data-product-details-variant`, `data-disclosure-variant`, `data-headline-size`).
  KRN's audit rule (shared vocabulary or `data-<block>-`) matches production.
- Grid exceptions set a clamp on the composition's own knob
  (`[data-layout=thirds] { --grid-min-item-size: clamp(16rem, 33%, 20rem) }`) —
  the library's pattern, not a custom layout.
- Themes are token re-pointings in a separate stylesheet (`theme.css`,
  `[data-user-theme=dark]`, `color-scheme`, `Canvas`/`CanvasText` system colors)
  plus `localStorage` — never component restyles.

Techniques worth adopting:

- **Resolved-knob layer**: each knob gets
  `--calculated-<block>-<knob>: var(--<block>-<knob>, <default>)` and
  declarations consume the calculated value. A variant then sets the knob once,
  hover can default to the resolved base
  (`--calculated-flow-cta-hover-color: var(--flow-cta-hover-color, var(--calculated-flow-cta-color))`),
  and dependent properties (focus ring, icon color, padding) stay in sync. Adopt
  it where several properties depend on one knob; keep the plain
  `var(--knob, default)` form for single-property knobs.
- **Wrapper inner type**: `.wrapper[data-wrapper-type=inner]` adds
  `--gutter-wrapper-inner-{block,inline}`, so a full-bleed band can carry its own
  background and inner gutters (`banner`, `fyi-unit`, `flow-cta` use it). Our
  library's wrapper has no inner type; use `region` plus a block background until
  it grows one.
- **Container queries for component-local breakpoints**: `@container
  course-branded-header (width < 40em)`, `@container linear-grid (width < 45em)` —
  named containers where the component, not the viewport, decides.
- **`text-box: trim-both cap alphabetic`** through one global variable
  (`--global-style-text-box-trim`) on headings and labels; progressive
  enhancement, so unsupported browsers keep the leading.
- **The tap-target minimum is a sanctioned floor**: the icon-only link carries
  `min-height: 44px; min-width: 44px` (WCAG 2.5.8 target size). It is the
  canonical accepted exception to the no-height-floor rule — register it with a
  reason; never copy it as a layout height.
- `!important` upstream appears only in forced-colors / system-color overrides,
  never in layout.
- Semantic markup: `<figure>`/`<blockquote>`/`<figcaption>` for praise,
  `<details>`/`<summary>` for the curriculum disclosure, `<dialog closedBy="any">`
  for the trailer, `<main tabindex="-1">`, and `visually-hidden` labels on
  icon-only controls.

Lander anatomy (a section-inventory template for future landing pages): branded
header (logo, theme toggle, CTA) → hero (badge, h1, lede, trailer dialog, hero
media) → intro prose → intro CTA (`flow-cta`) → praise group (grid thirds) →
ribbon divider → headline + product details
(`data-product-details-variant=outlined`, grid halves) → block CTA → praise
group → curriculum disclosure → preview video → enroll.

## Residual bounds

The fact files stay model-authored: `krn frontend design` parses the raw
MCP dumps into tokens/sections/components and `frontend facts` plus
`frontend audit --docs` validate all four facts against the code, but nothing
writes `tokens.md`, `sections.md`, or `components.md` automatically yet.

The primary course transcripts were not in this checkout when the vault synthesis
ran, so course rules are quoted from the vault's own standards pages. Every-layout
bodies are paywalled beyond the Cover snapshot. The height rule is a project policy
drawn from the sources above, not a verbatim single-source rule.
