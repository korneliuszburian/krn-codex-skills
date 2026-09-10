# Review matrix

## Preconditions and packet

Bind observation to the rendered revision or URL, brief/reference identity,
content fixture, state/action sequence, viewport or container, and provider
artifact. Missing comparator, state, or evidence is a finding, not permission
to infer intended design. Report only reproducible observations.

## Categories

| Category | Compare | Evidence that can disagree |
|---|---|---|
| Visual | hierarchy, type, rhythm, crop, surface, density, affordance | reference-bound render and observation |
| Responsive | declared widths/containers, zoom, content stress, RTL when relevant | state matrix and capture |
| Semantic | landmarks, heading/order, control choice, names and alternatives | DOM/source inspection and rendered state |
| Interaction | pointer, keyboard, focus, activation, loading/error | scenario evidence and manual pass |
| Accessibility | declared focus, contrast, reflow, assistive checks | tool output plus manual inspection |
| Engineering | host fit, warnings, diff scope, deterministic checks | target evidence or fixed-diff review |

## Severity and confidence

Use **blocker** when the primary action or required content is absent or unsafe
in a declared state; **major** when a core relationship, usable interaction, or
reference-critical hierarchy fails; **minor** for bounded visible degradation;
and **note** for an observation without a repair claim. Mark confidence **high**
only with direct reproducible evidence, **medium** when the symptom is clear but
cause/intent has a bounded uncertainty, and **low** when more evidence or a
decision is needed. Severity is impact, not aesthetic preference.

## Repair and non-proof

A finding names one likely repair owner and the smallest next check; it never
orders an edit. Browser and automated output cannot prove visual quality, WCAG
conformance, performance, or acceptance. Falsifier: if a reviewer cannot point
to the expected intent and a reproducible condition/evidence pair, downgrade it
to an unknown or omit it. Provenance: CV-07, PS-10, PS-11, and WAI evaluation
guidance; source review remains the separate `code-review` workflow.
