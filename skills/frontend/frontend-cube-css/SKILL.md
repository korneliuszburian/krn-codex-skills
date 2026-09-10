---
name: frontend-cube-css
description: Apply explicit CUBE CSS methodology to a host frontend's responsibility, composition, value, variant, or narrow existing-block styling decision; not substantial view authoring.
---

# CUBE CSS

Use CUBE as a companion methodology when the request explicitly chooses it or
the host convention requires it. Inspect the host's semantic structure, style
and value API, existing primitives, and evidence surface. Choose the smallest
owner for each styling responsibility: Global, Composition, Utility, Block, or
Exception.

`frontend-authoring` solely owns a substantial rendered view or page outcome,
including its lifecycle and refinement. This skill may independently make one
explicitly bounded styling edit inside an existing block or composition when
the named block, condition, and local CSS/markup boundary are already owned;
it stops after that condition and one neighbouring condition are checked.
Hand substantial presentation, a new view/region, or an unresolved
content/interaction decision to `frontend-authoring`. Hand semantic or
application state, shared Global/design-system ownership, and non-presentation
changes directly to their existing host owners. When a task spans both, keep
authoring responsible only for the rendered-view outcome and coordinate the
host-owned change at its existing seam. Return method and evidence to the
authoring owner when composed; CUBE never accepts a result.

Use host code and documented project conventions as the implementation
authority. These references are original decision synthesis from current
primary CUBE/HTML/WAI material and bounded practitioner, starter, and exemplar
evidence; private vault material is non-distributable, and no reference is a
vendored pattern library or exact API.

Read only the reference that answers the live decision:

- Read [global foundations](references/global-foundations.md) only for an
  explicit CUBE Global-layer creation or repair.
- Read [layers and markup](references/layers-and-markup.md) for Utility, Block,
  Exception, semantics, naming, and state/variant boundaries.
- [compositions](references/compositions.md) for a spatial relation or named
  composition selection.
- [values and cascade](references/values-cascade.md) for tokens, custom
  properties, specificity, or CSS layers.
- [evidence and repair](references/evidence-and-repair.md) for responsive,
  content, state, or focus failures.

Keep host framework, JavaScript, data, application state, and design-system
decisions with their owners. A CUBE label is a lens, not a mandate for a file
tree, sectioning rule, data attribute, no-JS baseline, token system, fixed line
limit, or no-query rule.
