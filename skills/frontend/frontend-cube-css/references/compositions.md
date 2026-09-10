# Compositions

Choose by the relationship that must survive content and width stress, not by a
named primitive. Preserve useful source/focus order; intrinsic sizing, Grid,
Flexbox, media queries, and container queries are all available when their
condition fits. Do not force a named composition when a small host-local rule
or an existing primitive is clearer.

## Relation brief

Before selecting a relation, record: direct children and likely cardinality;
source/focus order; stable relation; long, missing, translated, or tall-media
stress; controlling space (container, viewport, or content); overflow/stacking
behaviour; chosen host primitive; and test states. The markup shape is
landmark/section → optional containment → relation parent → direct children →
component internals; a host wrapper, component, or semantic element may occupy
any level.

| Composition | Select when | Do not select when | Check |
|---|---|---|---|
| Flow | direct siblings need vertical rhythm | two-dimensional tracks are needed | direct-child scope and long content |
| Grid | peers need two-dimensional tracks | it is a pair or overflow reel | few/many/tall items retain order |
| Cluster | inline peers may wrap together | two ends need separation | localisation, zoom, target usability |
| Repel | a few groups belong at opposing ends | a collection needs packing | narrow wrap does not split a control group |
| Sidebar | one supporting child accompanies flexible main content | three equal peers exist | semantic role and stacking threshold |
| Switcher | a pair sits together until its container cannot support it | a collection or precise grid is needed | useful source order in both layouts |
| Wrapper | content needs shared measure and gutters | full-bleed content or host shell owns it | nested context and RTL where relevant |
| Frame | media needs intentional ratio/crop | full intrinsic media must remain visible | portrait, landscape, missing media, caption |
| Reel | sequential items benefit from native horizontal overflow | all items/actions must be visible together | touch, keyboard/focus, overflow affordance |
| Breakout | a descendant intentionally spans wider than containment | the whole region belongs outside containment | nesting, scrollbars, RTL, baseline |

Configure a relation at the closest consumer. Use a custom property when a
contextual parameter has a clear consumer/default; otherwise use the host's
normal value mechanism. Queries are appropriate for environmental, typographic,
or interaction conditions that intrinsic layout cannot express.

Do not force a two-axis collection into a two-child switcher. A reel needs an
overflow affordance and keyboard check, not clipping. If a visual reorder is
needed, return to the markup/design decision rather than using layout to hide a
reading or focus-order contradiction.

## Limit, falsifier, provenance

No composition requires a no-media-query rule, a fixed child count, or a
particular CSS algorithm. If long, translated, zoomed, or narrow content loses
the relation; keyboard order conflicts with visual task order; or no row
describes the relation without smuggling in behavior/decoration, revise the
relation or choose a host-local rule. Provenance: CUBE composition concepts,
CSS layout mechanisms, and CV-03/PS-03; not copied composition-library code.
