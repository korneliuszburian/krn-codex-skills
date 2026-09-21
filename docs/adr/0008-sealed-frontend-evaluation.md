# ADR 0008: Sealed, track-specific frontend evaluation

- Status: accepted architecture; behavioral effect remains `lab-test`
- Date: 2026-09-21
- Decision owner: KRN skill-system maintainer
- Evidence: [frontend harness synthesis](../research/frontend-harness.md) and
  [lab-test registry](../research/lab-tests.md)

## Context

The current `cube-block` smoke places its check inside the workspace copied to a
candidate. That is useful integration coverage but not a held-out evaluator. A
single screenshot score would also confuse two different claims: producing a
good implementation from a design and reconstructing an explicitly fixed
source. Pixel similarity can reward structurally broken pages, while a purely
architectural check can miss visual, responsive, interaction, and accessibility
failures.

Replacing the current generic harness in one change would break active v1
consumers and make it impossible to distinguish migration defects from evaluator
defects.

## Decision

Introduce a versioned v2 frontend task/result contract beside v1. A v2 task
separates a public candidate workspace from an evaluator workspace that remains
outside the candidate sandbox. Public inputs carry every product requirement;
the sealed side carries only answers, captures, state paths, and checks. The
runner records oracle-sentinel and network evidence, freezes candidate output,
and only then invokes the evaluator. Hidden answers are permitted; hidden
requirements are not.

Evaluation has two explicit tracks. `design-transfer` leaves composition and art
direction open within the canonical method and never claims pixel identity.
`source-fidelity` exposes a source contract and may require exact geometry and
raw pixels under an identical environment digest. Both tracks report named,
separate axes for execution, behavior, accessibility, responsive behavior,
geometry, visual evidence, canonical architecture, efficiency, and provenance.
There is no weighted composite authority.

One-shot and bounded-repair runs remain separate cohorts. A repair follows one
externally classified causal failure and cannot retroactively improve the
one-shot result. Automated accessibility checks report their covered rules and
manual unknowns; they never claim complete WCAG conformance. Perceptual or VLM
judges remain diagnostic until a registered human calibration earns a gate.

Migration uses expand–migrate–contract: v1 and v2 coexist, new tasks prove their
known-good and targeted-mutant pairs, LT-8 runs on the sealed v2 path, and only
then may the candidate-visible frontend oracle and manual library authority be
removed. Generic comparison and signed project-verification surfaces with live
consumers remain.

## Consequences

- The runner, not candidate cooperation, enforces evaluator isolation.
- A failure stays attributable to a named axis; visual quality cannot hide a
  broken interaction and architectural purity cannot hide a broken layout.
- Source-fidelity thresholds cannot leak into ordinary design-transfer work.
- The first pilot can reject the frontend method or report no discrimination;
  architecture acceptance is not a claim of behavioral uplift.

## Rejected alternatives

- Strengthen the visible `cube-block` check in place: the candidate still sees
  the acceptance oracle.
- Use one screenshot, CLIP-like, VLM, or weighted score as the verdict: distinct
  failure modes and authority boundaries disappear.
- Run against mutable public websites: inputs and expected results cannot be
  reproduced or paired.
- Delete v1 before a v2 caller is green: this turns a bounded migration into a
  flag day and removes the rollback boundary.

## Supersession rule

Replace this ADR when a sealed-task experiment proves the split cannot prevent
contamination, when a real consumer needs a third claim with incompatible
authority, or when all v1 consumers are gone and a successor records the final
contracted ABI. Any replacement must retain raw per-axis results and the public
requirement/hidden-answer distinction.
