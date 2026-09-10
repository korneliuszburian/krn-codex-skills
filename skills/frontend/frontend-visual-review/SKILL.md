---
name: frontend-visual-review
description: Critique a rendered frontend against a supplied brief, reference, and declared states; produce an evidence-linked repair packet without editing or accepting the work.
---

# Frontend Visual Review

Own a read-only visual critique. Compare the rendered surface with its supplied
brief/reference and declared states. If intent, a state, or reproducible
evidence is missing, report that gap instead of inventing a target. Stop with a
prioritized repair packet; do not edit source, approve the result, or certify
accessibility or product acceptance.

Use an available browser provider only to observe a named URL/revision/state and
retain evidence pointers. Provider output is observation, not a quality verdict.
For every finding, record category, expected intent, observed condition and
viewport/state, evidence, severity, confidence, repair owner, and a bounded
repair suggestion. Separate visual, responsive, semantic, interaction,
accessibility, and engineering findings.

Read [the review matrix](references/review-matrix.md) for severity, confidence,
and evidence rules.
When a comparator exists, read [the review procedure](references/review-procedure.md)
for the ordered core-to-decoration pass.

## Boundaries

Hand one explicitly bounded existing-block or composition CUBE repair to
`frontend-cube-css`. Hand substantial rendered-view repair to
`frontend-authoring`, additionally composing `frontend-cube-css` only when the
repair explicitly selects CUBE or the host requires it. Hand application state,
shared design-system ownership, and other non-presentation changes directly to
their existing host owners. Hand a separately fixed source diff to `code-review`
for Standards and Spec review. This skill neither captures screenshots as an
end in itself nor substitutes for code review, acceptance, or an accessibility
audit.

Use host code and documented project conventions as the implementation
authority. These references are original decision synthesis from current
primary HTML/WAI material and bounded practitioner, starter, and exemplar
evidence; private vault material is non-distributable, and no reference is a
vendored pattern library or exact API.
