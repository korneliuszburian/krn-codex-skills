# Variants and rendered evidence

## Mechanism

Name the content, viewport/container, interaction, visible-state, zoom, and
motion variants that can change the result. Keep a concise self-inspection
record: stressed content; source, keyboard, and focus order; each visible
state; and reduced-motion behavior where motion exists. When responsive
behavior matters, retain observations at the relevant widths. A browser
provider observes; it does not judge quality or accept the result.

## Decision condition

Use this when a rendered view could appear correct only for one content shape,
viewport, or transient interaction state.

## Evidence record and repair

For each declared variant, record its condition, fixture/content shape,
viewport or container, interaction/state sequence, observed evidence, expected
result, and neighbouring state to inspect after repair. Repair at the named
owner, rerun the failing condition and its neighbour, and preserve an external
handoff instead of claiming that a capture proves quality or conformance.

## Limitations

The record demonstrates an inspected surface, not product acceptance, backend
correctness, performance budgets, or accessibility conformance. Hand those
non-proofs to their named product, application, performance, and accessibility
owners.

## Falsifier

If inspection finds clipped stressed content, a lost action, incorrect
source/focus order, an unintended state, or motion that ignores a declared
reduced-motion condition, repair before claiming the observed state works.

## Provenance

Local mechanism labels: CV-04, CV-07, PS-08, PS-10, PS-11. Primary sources:
WAI's [evaluation-tool guidance](https://www.w3.org/WAI/test-evaluate/tools/selecting/)
and [APG introduction](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/),
plus Andy Bell's [CSS project boilerplate](https://piccalil.li/blog/a-css-project-boilerplate/).

## Target-owner handoff

Hand accessibility review, performance investigation, and product acceptance
to their named owners while providing the rendered evidence and variant list.
