# Values and CSS layers

## Mechanism

Read the host value and cascade API first. Reuse a stable role token when it
fits; otherwise use a local role value or a parameter scoped at its nearest
consumer. Treat source order, specificity, and layer placement as separate
levers; do not create a shared token or an override merely to force a local
render.

## Decision condition

Use this when the work introduces color, type, spacing, motion, surface, or
override choices, especially where existing values might already apply.

## Value decision card

Record the visual role; existing host source inspected; selected owner (shared
role, local role, contextual parameter, or proposed design-system change);
default; intended consumers; permitted override site; and one leak, scatter, or
cascade check. A card surface used in one view stays a local role; spacing that
relates siblings belongs at their closest common parent. A repeated literal is
not, by itself, evidence for a global token.

## Limitations

This is not a license to create a global token system or force a fixed CSS
architecture on a host that already has a coherent local convention.

## Falsifier

If a value leaks to an unrelated consumer, scatters across intended consumers,
or needs escalating specificity to keep working, move it or clarify ownership.

## Provenance

Local mechanism labels: CV-05, CV-06, PS-04, PS-05, PS-06. Primary sources:
[CSS Cascade Level 5](https://www.w3.org/TR/css-cascade-5/#layering) and
[CSS Custom Properties Level 1](https://www.w3.org/TR/css-variables-1/), alongside
[CUBE composition](https://cube.fyi/composition) and
[CUBE utility](https://cube.fyi/utility).

## Target-owner handoff

Hand shared tokens, theming policy, and cascade-wide rules to the design-system
or platform owner; retain task-specific values in the view.
