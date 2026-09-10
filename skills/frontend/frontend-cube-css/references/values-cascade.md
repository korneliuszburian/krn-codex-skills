# Values and cascade

Read the host value API first. Classify each visual value as a **Global**
foundation role, **Block** local role, **Composition** relation parameter, or
finite **Exception**. Record its producer, default, consumer boundary, allowed
variation, and failure signal. A repeated literal is not by itself proof that a
shared role is warranted.

Choose a Global role only when the host already owns the shared concern; a
Block role for one unit; a Composition parameter at the closest common parent
of related consumers; and an Exception for a documented finite variation.
Expose a custom property only when context must vary a meaningful parameter.
Start from the intended consumer: give it a safe default, scope it no wider than
the nearest consumer or common owner, and inspect every descendant that inherits
it. A broad property can be right when the intended consumer is a whole local
subtree, but verify that boundary.

Diagnose a cascade symptom in this order: declaration origin, inheritance path,
specificity, then source/layer order. First use existing ownership/order; then
a narrow variant or context; use `@layer` only when the host already uses it or
a real cross-origin conflict needs it. A utility remains one coherent repeated
treatment, not a way to overpower a block.

## Limit, falsifier, provenance

This does not mandate DTCG, generated utilities, fluid scales, Tailwind, a
token-everything policy, or an `@layer` order. If a parameter leaks to an
unrelated consumer, a value edit scatters across intended consumers, or a fix
needs `!important`, ID selectors, or growing ancestor selectors, move the
value/rule to its owner. A locally repeated card surface can remain a Block
role; a gap shared by sibling regions belongs at their Composition parent.
Provenance: CSS custom properties and cascade mechanisms, CUBE value
conventions, and CV-05/CV-06/PS-04–PS-06.
