# Fluid scales — detail

## The clamp formula (Utopia)
- `clamp(min, min + slope·vw, max)` where slope = (max − min) / (maxViewport − minViewport). You design only min and max; the browser interpolates everything between.
- Default generator range: 360px → 1240px viewport.
- Example (18px → 20px): `--step-0: clamp(1.125rem, 1.0739rem + 0.2273vw, 1.25rem)`.
- Space example: `--space-s-l: clamp(1.125rem, 0.5625rem + 2.5vw, 2.5rem)`.
- Sources: https://utopia.fyi/type/calculator/ ; https://utopia.fyi/space/calculator/

## One scale, consumed everywhere
- "Utopia abstracts the maths away from specific HTML elements. Instead we create a set of related step values which can then be referred to by multiple elements."
- Define steps once as tokens on `:root` (`--step-0…`, `--space-3xs…--space-3xl`, one-up pairs like `--space-s-l`); consume them everywhere. Never inline a bespoke clamp() per element.
- Sources: https://utopia.fyi/space/calculator/ ; https://utopia.fyi/blog/utopian-typography-is-easy

## Why fluid beats breakpoint chains
- Viewports are a continuous space; breakpoints are discrete. Between breakpoints the size is always wrong ("too big or too small"). Interpolation removes the discontinuity.
- Course-side derivation: measure min-viewport base size and max-viewport base size plus the largest heading in the design tool, feed into a fluid calculator, tune the ratio, agree with the designer that sizes may be off by a pixel or two.
- Course-side space scale: take the gutter of a representative layout, measure at small and large viewports, define XS..4XL + pairing tokens as min/max JSON.
- Sources: https://utopia.fyi/blog/utopian-typography-is-easy ; course lessons 008, 022 (research/sources/complete-css/).
