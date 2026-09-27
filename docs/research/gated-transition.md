# The gated transition

Status: `accepted`. Consumer: the maintainer and `$delivery-loop`. Owner: maintainer. Verified: 2026-09-27.

This page owns one primitive and its evidence. [orchestration.md](orchestration.md)
owns research mechanisms, [workflow-lessons.md](workflow-lessons.md) owns
reusable rules, and the outcome capsule owns current operational state. This is
not a second store and not a claim that the primitive lifts outcomes.

## The primitive

**The gated transition.** A state change is admissible only when it carries:

1. a **machine-executed falsifier** that was **red at the base and green at the
   head** — the discharge is executed, never asserted;
2. executed by a **verifier independent of the author** — a pinned base
   evaluator, a world-state oracle, or a different model family;
3. pinned to an **immutable fixed point** that **auto-invalidates** (a stale
   anchor fails the gate);
4. any unpayable obligation is blocked until an **explicit, independently
   resolvable waiver names that obligation**; unscoped waivers are unsupported;
5. **failure-gated escalation** — no new mechanism, store, or agent until a
   *recorded, measured failure* of the current one survives bounded repair.

One sentence: **verification is a precondition for a transition, not an
artifact about it.** Only the commit CLI implements the executed admission
subset. World-state and different-family checks are evaluation criteria, not
shipped verifier adapters. Failure-gated escalation and a subagent brief remain
decision criteria, not helper APIs or evidence of agent benefit.

## What the grilling swarms refuted

Two swarms of read-only role-specialist subagents attacked the earlier theses;
both revisions are recorded here because the primitive is what survived them.

- **"One artifact replaces five stores" — refuted.** A trace is append-only, a
  state is mutable, a memory is reusable; fusing them is a category error and
  maximises the measured failure where the capsule copied task state and went
  stale while `state check` returned clean.
- **"Author-immutability as a disjunction including family difference" —
  refuted.** Deterministic and mechanical checks outperform LLM judges for
  false-success detection; cross-family rotation is not the default lever.
- **"The same shape at four scales" — refuted in code.** The surfaces are
  distinct engines with incompatible triggers and discharges; the verifier is
  author-immutable at only the commit scale.
- **The "45–48% self-report divergence" figure — asserted, not discharged.** Do
  not cite it without the exact table.
- **Subagent benefit — qualified no.** A bounded read-only subagent cannot own
  the artifact; it needs the **brief** (fixed point + scope + one falsifier
  command + output contract), not the five facets. The claim is the
  integrator's artifact; the brief is the subagent's task packet, not a
  `briefFor` function shipped by this module.

## Competitive boundary and current decision

The defensible bet is **admission conditioned on independently executed
proof**, not superiority over other agent frameworks. [AHE v4
(arXiv:2604.25850)](https://arxiv.org/html/2604.25850v4) already checks harness
edit predictions against subsequent task outcomes. It reports Terminal-Bench 2
improvement from 69.7% to 77.0% and transfer to one other task surface
(SWE-bench-verified) and alternate model families. Regression foresight is
weak (11.8% precision, 11.1% recall), component benefits interfere, and its
single evolution campaign with a fitted runtime budget does not establish a
head-to-head KRN comparison. A check
selected by the author cannot establish that the requirement matches user intent.
The proposed distinction remains `lab-test`, not measured behavioral benefit.

[ACE v3 (arXiv:2510.04618)](https://arxiv.org/html/2510.04618v3) supports
incremental curation but degrades without grounded feedback. [Delivery, Not
Storage v1 (arXiv:2607.20972)](https://arxiv.org/html/2607.20972v1) measures
cue-time delivery, but its 12 graded feature runs all passed, its forced
compaction probe had one run per arm, and its memory arm cost 36% more with a
different read cap; capture quality remains untested. [Total Recall v1
(arXiv:2608.11879)](https://arxiv.org/html/2608.11879v1) finds no universal
joint cost–accuracy winner across its systems and backbones. Serving cost
varies with synthetic dialogue workload; accuracy was measured on one LoCoMo
conversational benchmark subset, not a coding-agent workload. These support a
bounded outcome-scored test against unchanged/native controls, not another
store or automatic injection. Broader mechanisms remain owned by
[orchestration.md](orchestration.md).

At `591bd8b2`, the CLI admitted an invalid fixed point and an unresolvable
waiver: `krn gate check --root . --kind commit --fixed-point not-a-revision
--base HEAD~1 --falsifier false --waiver-reason diagnostic-only
--waiver-resolves docs/research/does-not-exist.md --json` returned
`admitted: true`, exit 0. The same counterexample was executed again at
`6cd50a5` before repair. Without the waiver, a failing head was refused, but
a real base-RED/head-GREEN invocation with the invalid fixed point was also
admitted. The repository gate passed 871/871 at `6cd50a5`; it did not test
these claims.

**Disposition: repair the existing CLI before expanding callers.** Resolve
HEAD and base to commits, refuse invalid or stale anchors and a dirty head;
classify executed failing Node TAP/spec cases separately from checkout, process,
and supported reporter setup errors. Other command formats cannot certify that
a nonzero exit was an assertion failure; a before/after status check is not an
atomic snapshot against transient writes. The existing waiver flags are deliberately fail-closed: they do
not name an obligation or independently resolve an anchor, so neither the
primitive nor the CLI may use them to excuse a failed head. The focused
public-seam observer is assertion-RED against pinned `6cd50a5` and GREEN on
the repaired candidate; installed runtime and benefit require their own
readback. The CLI constructs `claim.before.red` from its executed base check;
other engines have no corresponding caller or independently checked family or
escalation adapter. The readerless brief, family and escalation helpers were
retired rather than promoted as evidence. Reopen waivers only with a named
obligation, a granting owner, an independent resolver, and positive and
negative proof. This research finding grants neither publication authority nor
a change to the active Goal's order. Run transfer, discrimination, real defect
catch, and subagent-cost trials against unchanged/native controls before
claiming lift.

## The seams

- **Module**: `gated-transition` owns the Git-anchored CLI check and its
  internal admission policy; no second generic governance layer is exported.
- **Interface**: only `checkGateCommand` returns a CLI admission verdict with
  executed base/head evidence and pinned IDs.
- **Seam**: the command verifier is internal and observed through the CLI;
  a model-family label was never an independent review verifier.
- **Depth**: the CLI admits only `commit` and is the sole end-to-end consumer.
  Task close, review, and handoff have separate sources of truth; until their
  own proofs exist, even a passing command cannot admit those kinds.

## The falsifier

The primitive is falsified if any of these hold:

- **Transfer**: it cannot be applied to a differently-shaped Git repository
  with bounded effort; the present CLI needs Git commits and a shell command,
  not a Node layout.
- **Discrimination**: on a benchmark where the vanilla lane fails, the gated
  transition does not raise the pass rate with a confidence interval excluding
  zero.
- **Catch**: across a meaningful window on a real project it catches no defect
  that the vanilla lane would have shipped.
- **Subagent cost**: an actual bounded dispatch shows no benefit over a plain
  brief in clarification moves or parent verification cost. No claim-wrapper
  adapter is shipped, so this remains a proposed experiment, not a result.
