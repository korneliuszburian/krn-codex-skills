# Lint configuration — detail

## Base config
- `extends: ["stylelint-config-standard"]`; `maxWarnings: 0` (warnings fail CI); `reportDisables: true` on load-bearing rules.
- Stylelint ships 100+ rules; "no rules are turned on by default" — every convention must be switched on explicitly.
- Source: https://stylelint.io/user-guide/configure

## Token mandate
```json
{
  "rules": {
    "color-no-hex": true,
    "color-named": "never",
    "unit-allowed-list": ["rem", "em", "%", "s", "ms", "vi", "vb", "vw", "vh", "cap", "ch", "ex", "lh", "fr", "cqw", "cqi", "cqb", "cqh", "cqmin", "cqmax", "deg", "turn", "rad", "px"],
    "declaration-property-value-disallowed-list": {
      "font-weight": ["normal", "bold"],
      "font-style": ["italic"]
    },
    "custom-property-pattern": "^[a-z]+(-[a-z0-9]+)*$"
  }
}
```
- `px` in the allow-list: banned in component declarations by review + `declaration-property-value-disallowed-list` (e.g. `font-size` px patterns); allowed in the token layer (`:root` custom property definitions) — this mirrors the canonical library (`--stroke: 1px`).
- `color-no-hex` catches hex in gradients/shadows/borders, not just `color:` — no value escapes the token layer. The ONE exception: the generated token-utilities file, where hex legitimately lives once:
```json
{ "overrides": [{ "files": ["src/css/utilities/token-utilities.css"], "rules": { "color-no-hex": null } }] }
```
- `declaration-property-value-disallowed-list` gets a custom `message` pointing at the token/variant to use.

## Specificity caps
```json
{
  "declaration-no-important": true,
  "selector-max-id": 0,
  "selector-max-specificity": "0,2,0",
  "selector-no-qualifying-type": true,
  "max-nesting-depth": 2
}
```
- `no-descending-specificity` is already ON in stylelint-config-standard — the cheapest CI proxy for the ITCSS upward triangle / Specificity Graph ("spiky graphs are bad news").
- `0,2,0` accommodates CUBE blocks at `0,1,1` (`.block[data-state]`).
- Sources: https://stylelint.io/user-guide/rules ; https://csswizardry.com/2014/10/the-specificity-graph/

## Naming gates
- `selector-class-pattern` regex-checks every class (CUBE projects).
- `stylelint-selector-bem-pattern` plugin: BEM projects ONLY; must pass an explicit primary option — no default preset exists. Not for CUBE.
- Source: https://www.npmjs.com/package/stylelint-selector-bem-pattern

## Escape-hatch audit
- `reportNeedlessDisables: true`, `reportDescriptionlessDisables: true`, `reportUnscopedDisables: true` — disables must be scoped to the exact rule and described; stale disables error out.

## Import order = architecture (ITCSS)
- One entry file whose import list IS the layer order: settings → tools → generic → elements → objects → components → utilities (CUBE: global → compositions → utilities → blocks). Code-review that single file.
- Never let component files import utilities/globals themselves.
- Source: https://www.xfive.co/blog/itcss-scalable-maintainable-css-architecture/

## What NOT to do
- No CI gate on specificity-graph shape — Roberts: "probably best kept as a conceptual model"; tools exaggerate kinks. Use selector caps as the binary proxy.
- No warning-severity rules as the only gate — ignored noise.
- No review-only conventions — naming enforced by regex gates is diff-visible; review-only drifts within a week.
