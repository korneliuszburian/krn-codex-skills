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
each sealed assertion links to a stable public requirement identity and declares
its applicable track and axis. The sealed side carries only answers, captures,
state paths, and checks. The runner uses a selected containment backend, records
active denial, oracle-sentinel, and network evidence, terminates candidate
descendants, freezes candidate output, and only then invokes the evaluator under
a separate authority. A sentinel detects some leaks but does not by itself prove
unreachability. Hidden answers are permitted; hidden requirements are not.

The first admitted backend is non-setuid `bubblewrap >= 0.12`. Candidate and
evaluator execute in separate mount, PID, IPC, UTS, cgroup, user, and network
namespaces with a cleared environment. The candidate receives one writable copy
of the public workspace. A runner-owned observer receives only the frozen
read-only artifact and emits the public observation envelope. In a different
namespace, the evaluator receives only that envelope plus a read-only sealed
workspace whose bytes match the task's declared evaluator digest; candidate
code is never executed where the sealed workspace is mounted. A runner-owned
probe measures the effective sandbox locale, timezone, runtime, browser build,
font inventory, container, OS, and public local-asset digests. Capture-only
settings remain explicitly not applicable until a browser observer enforces
them. The first admitted network profile is `denied`. A model run
that needs Internet access is refused until an operator-owned proxy or equivalent
egress adapter can record and constrain the effective traffic; inherited host
network access is not an isolation profile.

Evaluation has two explicit tracks. `design-transfer` leaves composition and art
direction open within the canonical method and never claims pixel identity.
`source-fidelity` exposes a source contract and may require exact geometry and
raw pixels under an identical environment digest. Both tracks report named,
separate axes for execution, behavior, accessibility, responsive behavior,
geometry, visual evidence, canonical architecture, efficiency, and provenance.
There is no weighted composite authority.

One-shot and bounded-repair runs remain separate cohorts. A repair follows one
externally classified causal failure and cannot retroactively improve the
one-shot result. That category selects a named axis whose direction, viewport
ordering, ties, errors, and missing-data behavior are fixed before repair; no
cross-axis composite is created. Automated accessibility checks report their
covered rules and manual unknowns; they never claim complete WCAG conformance.
Perceptual or VLM judges remain diagnostic until a registered human calibration
earns a gate.

Experimental treatment is also explicit. A revision-pinned frontend profile and
candidate-visible delivery probe establish that treatment receives the frontend
method and control does not, while unrelated inputs and surfaces remain
equivalent. Global installation, a broad capability profile, or the generic KRN
harness export is not evidence of treatment delivery.

Migration uses expand–migrate–contract: v1 and v2 coexist, new tasks prove their
known-good and targeted-mutant pairs, LT-8 runs on the sealed v2 path, and only
then may the candidate-visible frontend oracle and manual library authority be
removed. Generic comparison and signed project-verification surfaces with live
consumers remain.

## Consequences

- The runner, not candidate cooperation, enforces evaluator isolation.
- The offline backend is sufficient for deterministic fixtures and locally
  available agents, but it does not claim that a hosted model can run inside the
  same profile.
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
