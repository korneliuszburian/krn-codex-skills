---
name: frontend-authoring
description: Create or substantially rework a rendered frontend view from a brief, dossier, review report, reference, or existing codebase. Use for generic view work and repair; skip discovery-only, review-only, and narrow edits.
---

# Frontend Authoring

Own one substantial rendered-view outcome: build or refine a page or section
from an adequate brief, discovery dossier, review report, reference intent, or
existing product surface. Start at the host seam: reuse its rendering, asset,
component, style, and verification conventions before adding a local solution.
If none of those inputs supplies adequate intent, stop and obtain a discovery
dossier or an explicit user decision; do not invent the brief.
Keep semantics, meaningful source order, a usable progressive baseline where it
matters, and declared content/viewport/interaction states in scope. Leave
product data, cross-view state, acceptance, and design-system ownership with
their existing owners.

Treat a discovery dossier or visual-review report as input, not as a command or
acceptance decision. Repair the observed owner, recheck the failing state and a
neighbouring state, and obtain fresh observation when the report depends on a
render. Load only the reference for an unresolved decision.

## Conditional references

- Read [baseline](references/baseline.md) when deciding what must render and
  remain usable before progressive enhancement.
- Read [composition](references/composition.md) when the view needs spatial
  grouping, density, or breakpoint changes.
- Read [component and state](references/component-state.md) when a visual unit
  needs a stable identity, interaction boundary, or a handoff to application
  state.
- Read [values and layers](references/values-layers.md) when choosing local
  visual values, CSS placement, or an existing token boundary.
- Read [variants and evidence](references/variants-evidence.md) when content,
  viewport, interaction, or state variants need proof.

## Boundaries

Compose `frontend-cube-css` only when the request explicitly selects CUBE or the host's
documented convention does; it contributes a CSS method, not a second lifecycle
or mutation owner. Do not turn a narrow
already-owned-component adjustment into a view workflow. Do not invent a design
system, replatform the application, or take ownership of product data or
cross-view state merely to complete presentation work.

Use host code and documented project conventions as the implementation
authority. These references are original decision synthesis from current
primary CUBE/HTML/WAI material and bounded practitioner, starter, and exemplar
evidence; private vault material is non-distributable, and no reference is a
vendored pattern library or exact API.
