# Composition

## Mechanism

Name the relationship first, then choose the host primitive and a direct-child
contract that preserves reading/focus order: grouping, measure, spacing, and
reflow follow from that relation. Test constrained width and stressed content;
use intrinsic layout when it fits, and a media or container query when the
required condition is environmental or cannot be expressed intrinsically.

## Decision condition

Use this when a brief requires a new page or section, a meaningful density
change, or different relationships across desktop, tablet, and mobile.

## Relation brief

Record direct children and likely cardinality; source/focus order; stable
relation; long, missing, translated, or tall-media stress; controlling space
(container, viewport, or content); overflow/stacking behaviour; chosen host
primitive; and test states. Keep the region shape legible: landmark/section,
optional containment, relation parent, direct children, then component
internals. A 1–12 card collection is not a switcher, a reel needs an overflow
affordance plus keyboard check, and a visual reorder returns to markup/design.

## Limitations

Composition is not a mandate to replace the host's styling method or prescribe
a library. Preserve established layout primitives when they fit the seam.

## Falsifier

At the required widths or containers, if stressed content loses its relation,
or visual order contradicts the task's source/focus order, revise the layout.

## Provenance

Local mechanism labels: CV-03, PS-03. Primary sources:
[CSS Display Level 3](https://www.w3.org/TR/css-display-3/) and
[CSS Grid Layout Level 2](https://www.w3.org/TR/css-grid-2/), alongside
[CUBE composition](https://cube.fyi/composition).

## Target-owner handoff

Hand a cross-page layout system, shared primitive, or navigation-shell change
to its established frontend owner; keep the task-specific composition local.
