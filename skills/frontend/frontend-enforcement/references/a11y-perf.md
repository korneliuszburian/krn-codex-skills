# A11Y and performance gates — detail

## Accessibility gates
- Per-component acceptance: written accessibility acceptance criteria + automated a11y tests in CI + manual checks for what automation misses. Site-wide-only audits fail (axe-style scans miss keyboard and screen-reader issues).
- Visual regression as merge gate: PR status check, non-zero exit on unreviewed diffs — motivated by GOV.UK's 350,000+ pages where change impact was otherwise untraceable.
- Sources: https://insidegovuk.blog.gov.uk/2018/02/15/creating-tools-to-ensure-a-consistent-frontend-on-gov-uk/ ; https://www.chromatic.com/docs/ci/

## Focus and keyboard
- Never remove outlines without a replacement; WCAG 2.4.7 Focus Visible; indicator ≥ 3:1 contrast (1.4.11).
- `:focus-visible` customizes when/where the ring appears; fallback `@supports not selector(:focus-visible)` keeps native outlines in old browsers.
- Source: https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible

## Logical order
- `order` and grid placement don't reorder keyboard/AT traversal; logical reordering via CSS is non-conforming. Tab around the document as the acceptance test.
- `display: contents` removes boxes from the a11y tree — `subgrid` instead. Avoid `grid-auto-flow: dense`.
- Source: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Grid_layout_and_accessibility

## ARIA
- First rule: use a native element when one exists. Incorrect ARIA "misrepresents visual experiences, with potentially devastating effects" — a role is a promise. Never `role="button"` on a div without Enter+Space+focusable; never override native semantics (`<a role="menuitem">`).
- Source: https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/

## Motion
- Animations default OFF; enable only under `@media (prefers-reduced-motion: no-preference)`. Vestibular disorders make motion a medical necessity to remove.
- Source: https://web.dev/articles/prefers-reduced-motion

## Performance
- `content-visibility: auto` + `contain-intrinsic-size` for long below-the-fold sections — measured 7x initial-render speedup (232ms → 30ms); Facebook: up to 250ms navigation improvement. Never apply without the intrinsic size (scrollbar jumps); off-screen content stays in the a11y tree — hidden landmarks inside need `aria-hidden="true"`.
- `font-display` explicit on every `@font-face`; never `auto` (invisible-text periods on slow connections; inconsistent behavior).
- Sources: https://web.dev/articles/content-visibility ; https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display

## Code Review Rules mechanics (Codex)
- Section `## Code Review Rules` in AGENTS.md, `###` topic groups; rules state the invariant and the safe path, 2-4 lines; describe outcomes, not function names; mechanical checks stay in CI.
- Repo-wide rules in root AGENTS.md; service-scoped rules in the nearest nested file.
- Sources: https://developers.openai.com/codex/third-party/github ; https://developers.openai.com/blog/custom-code-review-rules-for-codex
