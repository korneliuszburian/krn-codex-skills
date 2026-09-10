# Layers and markup

## Responsibility lens

| Concern | Select when | Do not use as | Repair signal |
|---|---|---|---|
| Global | a shared baseline belongs to the host | a local component override | unrelated view changes after a local edit |
| Utility | one repeated, coherent treatment has a stable value source | a specificity escape or unrelated bundle | it needs escalation or has only accidental use |
| Block | a unit has stable semantic, interaction, or reuse identity | every static grouping | it changes only with page context or couples unrelated units |
| Exception | a finite presentational variance changes a known unit | a state machine or second component | it contradicts semantics or grows behavior/identity |
| Composition | siblings/regions need a content-agnostic spatial relation | decoration or a block's identity | the relation is duplicated inside unrelated units |

These are decision lenses, not mandatory folders, cascade layers, class syntax,
or an order in which work must happen. Let surrounding context own a block's
external placement; internal layout may belong to the block when it expresses
its own content relation. A long block invites a responsibility inspection, not
a line-count split.

## Markup and state

Begin from real content, useful source order, and element semantics. Use a
labelled `section` for a thematic region, `article` for independently
distributable content, `nav` for navigation, and `div` for non-sectioning
grouping where that meaning is absent. Prefer native controls; preserve readable
labels, alternatives, keyboard operation, and visible focus.

Keep native/ARIA state (`disabled`, `open`, `aria-current`, validation,
pressed) truthful. A finite presentation hook can use the host's variant API;
in a CUBE CSS unit, a scoped `data-*` hook is a useful option, but neither
required nor a substitute for semantic/application state.

## Presentation-variant contract

Retain the host's component, element, utility, and variant naming convention.
If it has none, choose one local component convention, document the purpose of
any non-obvious selector or calculation, and leave external placement with the
parent. Mixed naming or ordering within one feature is a search/reuse failure,
not an invitation to impose a repository-wide class order.

Before styling a presentation variant, record its finite documented domain,
default, owner, selector hook, and the local parameter it may change. When the
host selects `data-*`, presence is an on/off fact and one string value selects
one mutually exclusive presentation variant. A presentation selector may tune
declared local parameters; it may not stand in for `disabled`, `aria-current`,
loading, validation, permissions, or other semantic/application truth. For
example, a `data-tone` hook that makes a disabled submit look disabled while
the native control remains enabled is invalid.

## Limit, falsifier, provenance

This does not prescribe BEM, data-only state, a `section` ban, framework, or
no-JavaScript architecture. If two concerns claim one rule, a visual hook
contradicts native/ARIA state, or moving a block forces an internal edit for a
purely external concern, redraw ownership. Provenance: CUBE's responsibility
vocabulary, HTML/WAI semantics, and the local CV-04, CV-06, PS-07, PS-08, and
PS-09 dispositions; this is original operational synthesis, not a copied class
or attribute API.
