# Component identity and state boundary

## Mechanism

Give a visual unit its own component only when it has independent semantic
identity, interaction, or repeatable variants. Inventory state before styling:
native/ARIA semantics stay truthful, application state stays at the host seam,
and finite presentational variance stays local.

## Decision condition

Use this when a section adds an interactive control, repeated item, or
visible state whose responsibility would otherwise be ambiguous.

## State ledger

Complete this before styling an ambiguous visible condition:

| Visible condition | Source of truth / owner | Semantic control or ARIA truth | Local presentation input | Values, default, and checked state |
|---|---|---|---|---|
| Current navigation item | Current route / navigation owner | `aria-current` or equivalent host truth | Existing current-item treatment | One current item; checked against destination |
| Compact density | View/component owner | None: decorative only | Finite local density variant | `comfortable` default, `compact` only when declared |

Hand off any entry that needs persistence, permissions, validation, analytics,
or cross-view coordination. A selected tab, disabled submit, current navigation
item, loading content, and compact treatment each need one owner; reject any
hook that contradicts the native or ARIA condition, then inspect the next state
that can change the same control.

## Limitations

This does not authorize new global state, a component library, or changes to
domain behavior. A one-off static grouping may remain in its parent view.

## Falsifier

If a visual hook contradicts native or ARIA state, local presentation needs
unrelated-screen knowledge, or a repeated unit cannot change independently,
redraw the boundary or hand the state back to its owner.

## Provenance

Local mechanism labels: CV-04, PS-07, PS-09. Primary sources:
[HTML interactive elements](https://html.spec.whatwg.org/multipage/interactive-elements.html)
and WAI's [APG introduction](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/),
with [CUBE block](https://cube.fyi/block) and
[CUBE exception](https://cube.fyi/exception).

## Target-owner handoff

Hand persistence, server data, permissions, analytics semantics, and
cross-view coordination to their application owners; consume their public seam.
