---
name: frontend-enforcement
description: Make CSS conventions binary — stylelint token and specificity caps, scoped disables, visual regression, and accessibility gates in CI. Use for linting, CI setup, or CSS quality checks; skip product decisions and prose.
---

# Enforcement — make conventions binary

Conventions written only in documentation die within weeks. Enforce with lint and
CI; keep review rules for invariants.

## <required> — when setting up or running checks

1. IF CI must fail on a convention THEN configure it as an error-severity stylelint rule (or set `maxWarnings: 0`).
2. IF a rule is load-bearing THEN enable `reportDisables: true` so `stylelint-disable` cannot silently opt out.
3. IF a check is mechanical (formatting, lint) THEN it belongs in CI, never in Code Review Rules.
4. Run lint before finishing any CSS task; treat warnings as failures.

## Rules

### The theme audit — the stage's binary frontend gate
- IF the project carries a theme THEN run the harness audit through the project's own script: `krn-codex frontend audit --root <theme> --docs docs/design/blocks.md` (wrapped as `frontend:audit`). It is read-only and needs no build.
- Rules it enforces: `block-height` (no height floors), `magic-color` (tokens, never literals), `block-size-bar` (thin skeleton, target ≤ ~100 lines, soft), `class-variant` (a variant is a `data-*` exception, not a BEM modifier, soft), `block-ownership` (one file, one block), `variant-naming` (shared library vocabulary or `data-<block>-` prefix), `facts-registry` (a `built`/`verified` row needs `src/css/blocks/<slug>.css`), `template-variant` (a variant value must exist in the theme or the library).
- IF a finding is genuinely justified by the design THEN register it with `--accept <rule>:<file>` and record the reason in the project's enforcement doc. NEVER loosen the rule, NEVER accept silently.
- NEVER mark a block `built`/`verified` while its styles live inside a section file — `facts-registry` and `block-ownership` fail together; the facts must match the code.

### Token mandate (stylelint config)
- IF the project is token-driven THEN set: `color-no-hex: true` (with a scoped, described disable for the generated token-utilities file, where hex legitimately lives in one place), `color-named: "never"`, `unit-allowed-list` containing the canonical units of this stack: `["rem","em","%","s","vi","cap","ch","fr","cqw"]` — px is banned in component declarations, allowed only inside token-layer custom property definitions, `declaration-property-value-disallowed-list` for values that must come from tokens, `custom-property-pattern` for token naming.
- NEVER allow raw hex/px design values past CI. `color-no-hex` catches hex in gradients/shadows/borders, not only `color:`.
- GOOD: `color: var(--color-text-primary)` / BAD: `color: #252525` (build fails).

### Specificity caps
- IF the project follows CUBE/ITCSS THEN set: `declaration-no-important: true`, `selector-max-id: 0`, `selector-max-specificity: "0,2,0"`, `selector-no-qualifying-type: true`, `max-nesting-depth: 2`, keep `no-descending-specificity` from `stylelint-config-standard`.
- NEVER allow an unregistered exception to these caps. `!important` is banned everywhere (data-attribute exceptions make state-`!important` unnecessary).

### Naming gates
- IF naming conventions are required THEN regex gates (`selector-class-pattern`); use `stylelint-selector-bem-pattern` ONLY in BEM projects (it must not run in CUBE projects) and always pass an explicit primary option — the plugin has no default preset.
- NEVER enforce conventions by code review alone.

### Import order = architecture
- IF the project has a global stylesheet THEN one entry file whose import list IS the layer order (global → compositions → utilities → blocks); review that single file.
- NEVER allow component files to import utilities/globals themselves.

### Escape hatches audited
- IF a `stylelint-disable` is needed THEN it must be scoped to the exact rule and carry a description (`reportDescriptionlessDisables`, `reportUnscopedDisables: true`); needless disables must error (`reportNeedlessDisables: true`).
- NEVER unscoped `/* stylelint-disable */`.

### CI beyond lint
- IF a PR touches CSS/components THEN require the visual-regression check to pass before merge (PR status check, non-zero exit on unreviewed diffs).
- IF a component ships THEN it has written accessibility acceptance criteria + automated a11y tests + manual checks for what automation misses.
- NEVER treat a11y as a site-wide audit-only concern.

### Specificity graph
- IF you audit CSS health THEN a specificity graph is a periodic human artifact (before/after refactors). NEVER build a CI gate on graph shape — use the selector caps instead.

### Code Review Rules (Codex section)
- IF a review rule is repo-wide THEN `## Code Review Rules` in root AGENTS.md; IF service-specific THEN the nearest nested file.
- IF writing a review rule THEN state the invariant and the safe path in 2–4 lines; describe outcomes, not function names (names rot).
- NEVER put lint/format checks in review rules.

## Final checklist
- [ ] stylelint runs in CI with `maxWarnings: 0` and error severity on the token/specificity rules
- [ ] No raw values, no `!important`, no IDs, specificity ≤ 0,2,0 in the codebase
- [ ] Disable comments are scoped and described
- [ ] Visual regression is a merge gate for CSS changes
- [ ] Review rules state invariant + safe path

## References

- [references/lint-config.md](references/lint-config.md) — full stylelint rule set with rationale and sources.
- [references/a11y-perf.md](references/a11y-perf.md) — accessibility and performance gates with measured evidence.
