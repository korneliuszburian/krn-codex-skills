# Token architecture — detail

## Naming scheme (rekurencja boilerplate default)
- Colors (DTCG JSON with aliases): `color.dark`, `color.light`, `color.surface`, `color.muted`, `color.primary`, `color.accent`, `color.focus`, `color.bg` (= `{color.light}`), `color.text` (= `{color.dark}`), `color.selection.bg/text` → CSS `--color-*`.
- Sizes: `--size-step-00`…`--size-step-5` (Utopia fluid steps) + semantic roles `--text-size-base` (`--size-step-0`), `--text-size-heading-1` (`--size-step-5`), etc.
- Spacing: `--space-3xs`…`--space-2xl` + fluid pairs `--space-s-m` etc.
- Other roles: `--radius-s/m/l`, `--stroke` (1px), `--measure` (65ch), `--wrapper-max-width`, `--gutter`, `--leading-standard/fine`, `--font-base/display`, `--font-weight-*`, `--kerning-*`, `--transition-*`, `--focus-color`, `--selection-bg/text`, `--body-bg/--body-color`.
- Resolver: `tokens.resolver.json` maps the JSON to CSS variables; tokens live in one place (JSON), consumed everywhere.
- Source: https://github.com/rekurencja/boilerplate-rekurencja (`src/design-tokens/*.json`, `src/css/global/variables.css`) — base fork: https://github.com/mark-tomlinson-dev/cube-boilerplate/tree/feat/with-sugarcube-2

## Two-tier structure (raw → semantic)
- Raw tokens: palette and scale values with no role (`--color-light`, `--size-step-2`, `--space-s-l`).
- Semantic tokens: roles consuming raw values (`--color-global-bg`, `--color-global-text`, `--color-surface-bg`, `--text-size-heading-1`).
- Global and component CSS reference semantic tokens ONLY. Raw tokens are referenced only by semantic tokens.
- Theming: "The really important thing about theming is you need to abstract into more specific, semantic variables" — a theme changes ~6 semantic variables in `:root` to retheme the whole UI. A component referencing raw palette variables forces a 40-file edit on theme switch.
- Sources: https://piccalil.li/blog/how-were-approaching-theming-with-modern-css/ ; https://design-tokens.github.io/community-group/format/ (aliases as the raw→semantic mechanism).

## Progressive custom properties
- "Almost every property is using the var function with sensible defaults" — every block/composition knob is `var(--x, default)`; a context/theme overrides by setting one variable. Defaults are discarded the moment the variable is defined.
- Source: theming article (above).

## Token generation
- Tokens are defined away from CSS (JSON) and compiled into custom properties and one-job utilities (`.bg-primary`, `.color-primary`) — "defined once and applied everywhere".
- Source: https://cube.fyi/utility.html

## Production evidence (Shopify Polaris)
- Components used in 70% of the admin; tokens covered only 44% of components → product teams hardcoded values or forked components; global changes became "infinitely challenging and costly".
- Root cause: token values lived across multiple projects, in multiple formats (CSS custom properties, Sass functions, Sass mixins), with scattered docs and a multi-repo release process.
- Fix (Polaris v9): consolidate all styling variables/functions/mixins into design tokens, emit CSS custom properties, centralize documentation.
- Source: https://medium.com/shopify-ux/putting-the-system-back-in-our-design-system-b2c55a392dea (2022, via Wayback).

## Token rules
- Space tokens only for space properties (padding/margin/gap); never width/height/outline-offset. Source: https://polaris-react.shopify.com/design/layout/layout-tokens (via search snippet).
- DTCG: tokens are typed name/value pairs (a `type` member plus a `value` member); names must not start with a dollar sign or contain `{`, `}`, `.`; case-only duplicates collapse in translation. Source: DTCG format spec (above).
- Subatomic particles: Frost extends Atomic Design with tokens BELOW atoms — a token is "not exactly functional on its own", it must be applied to an atom to come to life. Source: https://bradfrost.com/blog/post/extending-atomic-design/ (2019).

## Contrast tokens (WCAG)
- AA: 4.5:1 normal text, 3:1 large text (≥18pt/24px or ≥14pt/18.66px bold); AAA: 7:1 / 4.5:1. Non-text (1.4.11): 3:1 for UI components and focus indicators.
- Links distinguished by color alone need 3:1 against surrounding text plus a non-color cue.
- Source: https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2#contrast-minimum
- Foundations page: prototype a page documenting colour/contrast/fonts/leading/type/space and a11y-test the palette there — drop combos that fail in practice even when they pass WCAG AA on paper. Source: https://piccalil.li/blog/redesigning-piccalilli-the-first-part-of-the-design-process/ (2024).
