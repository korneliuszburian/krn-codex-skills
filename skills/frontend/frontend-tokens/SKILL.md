---
name: frontend-tokens
description: Define two-tier design tokens, fluid clamp scales, semantic aliases, and theming. Use for tokens, custom properties, dark mode, palettes, type or space scales, or contrast; skip component layout and lint setup.
---

# Design tokens, theming, fluid scales

Tokens are the single source of truth for every design value. Components consume tokens only.

## <required> — before defining or using any value

1. IF a token already exists for the value THEN use it. NEVER define a duplicate token for the same value.
2. IF no token exists and the value is used by more than one component THEN add it to the token layer, not to the component.
3. IF the canonical library exists THEN copy the token set VERBATIM from `.agents/skills/frontend-library/library/design-tokens/` (DTCG JSON + `tokens.resolver.json`) and `library/css/global/variables.css`. NEVER paraphrase or invent a parallel scheme.
4. Use the two-tier structure: the token layer (`--color-*`, `--size-step-*`, `--space-*`, `--text-size-*`) is what components consume; literal values (hex/px/rem) in components are banned. (Disposable prototypes are exempt — see frontend-process Phase 0.5.)

## Rules

### Two tiers: raw → semantic
- IF you define a palette or scale value THEN it is a raw token (`--color-light`, `--size-step-2`).
- IF a role exists (background, text, heading size) THEN wrap it in a semantic token (`--color-global-bg`, `--text-size-heading-1`).
- Stack convention (rekurencja boilerplate): `--color-*`, `--size-step-*`, `--space-*`, `--text-size-*` ARE the token layer — components consume these variables directly; what is banned is literal values (hex/px) in components, not token variables.
- GOOD: `.button { background: var(--button-bg, var(--color-primary)) }` / BAD: `.card { color: #222 }`.
- NEVER reference literal values from components. A theme re-points the role variables in `:root`, not components.

### Every knob is a variable
- IF a component or composition has a tunable aspect THEN write `property: var(--component-aspect, sensible-default)`.
- NEVER write fixed values in a block that a theme or context may need to change.
- GOOD: `.button { background: var(--button-bg, var(--color-surface-bg)) }` / BAD: `.button { background: #ff00ff }`.

### Fluid scales (type and space)
- IF you size type or space THEN use `clamp(min, min + slope·vw, max)` generated from min/max design values (Utopia-style calculators), defined once as step tokens on `:root`.
- NEVER set fixed rem font sizes switched by media queries. NEVER write a bespoke clamp() per element — one scale of step tokens consumed everywhere.
- GOOD: `--size-step-2: clamp(1.44rem, 1.2016rem + 1.1918vi, 2.0508rem)` / BAD: `@media (min-width: 768px) { h1 { font-size: 3rem } }`.

### Re-theme vs tweak
- IF the design is a different design system (different palette, type stack, scale) THEN it is a **re-theme**: replace the token values in the token layer, keep the DTCG shape and the fluid min/max extension, and never mix the two palettes (an old primary with a new accent is a half-retheme).
- IF only values inside the shipped system change THEN it is a **tweak**: change those tokens and record the deviation.
- NEVER re-theme by editing components or blocks; a theme re-points token values only.
- Record the decision and every deviation in the project's `tokens.md` — the literal-value audit rule is the backstop, not the proof.

### Contrast is a token property
- IF you define a text-on-background pair THEN pre-verify it as tokens: 4.5:1 normal text, 3:1 large text (AA); 3:1 for UI components and focus indicators.
- IF a color combination fails in practice (even when WCAG AA technically passes) THEN change it before building components — build a foundations page (colour/contrast/fonts/leading/type scale/space scale) and test the palette there.
- NEVER define raw foreground/background colors in component code where contrast is unverifiable.

### Token hygiene
- IF a value changes THEN change the token file only. NEVER hand-write a token value in a component.
- IF naming tokens THEN use the project scheme; default scheme: `--color-<role>` (dark/light/primary/accent/surface/muted/bg/text), `--size-step-N` for type, `--space-<size>` for spacing, `--radius-<size>`, `--stroke`, `--leading-<role>`, `--font-<role>`, `--measure`, `--wrapper-max-width`, `--gutter`. NEVER invent ad-hoc numeric scales (`--raw-size-3: 0.75rem`) or Tailwind-style numbers.
- IF defining a token in a shared/interchange format THEN give it a `type` member plus a `value` member (DTCG style). NEVER names with a leading dollar sign, `{}`, `.`, or case-only duplicates.
- IF a space declaration (padding/margin/gap) THEN use a space token. NEVER use a space token for width/height/outline-offset.
- IF tokens must be consumed across teams THEN one file, one format, one doc page. NEVER duplicate the same token in two repos/formats (drives hardcoding).
- IF you ship a component THEN tokenize every value it consumes first. NEVER ship a component consuming untokenized values.

### Dark mode / theming
- IF the design must support light+dark THEN themes are variable re-pointings: a theme changes semantic tokens in `:root` or a context wrapper.
- NEVER restyle components for a theme. NEVER build a theme toggle during prototyping — a separate URL per theme is the prototype pattern; the toggle is production-phase work.

## Final checklist
- [ ] Every component value traces to a semantic token
- [ ] No raw hex/px/rem literals in component CSS
- [ ] Fluid clamp steps on `:root`; zero breakpoint font-sizes
- [ ] Contrast pairs verified as tokens (4.5:1 / 3:1)
- [ ] Theme switch changes only semantic variables

## References
- [references/token-architecture.md](references/token-architecture.md) — tier structure, source examples, conflict notes.
- [references/fluid-scales.md](references/fluid-scales.md) — clamp formulas and scale derivation from design values.
