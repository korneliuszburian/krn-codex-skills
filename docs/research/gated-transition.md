# The gated transition

Status: `accepted`. Consumer: the maintainer and `$delivery-loop`. Owner: maintainer. Verified: 2026-09-26.

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
4. any unpayable obligation recorded as an **explicit, resolvable waiver**,
   never silent;
5. **failure-gated escalation** — no new mechanism, store, or agent until a
   *recorded, measured failure* of the current one survives bounded repair.

One sentence: **verification is a precondition for a transition, not an
artifact about it.** An agent framework lets a model *record* progress; this
makes progress *unrepresentable* without independent proof.

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
  integrator's artifact; the brief is the subagent's.

## Why the residual is the invention

The strongest external read: this is *"better than all six agent frameworks on
exactly one axis"* — the axis none of them treats as first-class. LangGraph,
Mastra, Letta, LangSmith and the rest give an agent more capability; the gated
transition removes the agent's ability to *misrepresent* progress. That
inversion is the bet, and it is under-served rather than solved.

## The seams

- **Module**: `gated-transition` — one small interface over the whole
  governance (red-state, base-pinning, independence, waiver, escalation).
- **Interface**: `gateTransition({ transition, claim, verifier })` returns an
  admission verdict. The caller learns one function and three shapes.
- **Seam**: the **verifier** is injected. Two adapters make it a real seam — a
  deterministic command verifier and a different-family review verifier.
- **Depth**: the four surfaces (commit, task close, review, handoff) become
  callers; the deletion test passes because the governance reappears in four
  callers otherwise.
- **Brief**: a projection of the claim for a subagent, not a second artifact.

## The falsifier

The primitive is falsified if any of these hold:

- **Transfer**: it cannot be applied to a differently-shaped repository with
  bounded effort (it needs only "a command that exits nonzero", never a Node
  layout).
- **Discrimination**: on a benchmark where the vanilla lane fails, the gated
  transition does not raise the pass rate with a confidence interval excluding
  zero.
- **Catch**: across a meaningful window on a real project it catches no defect
  that the vanilla lane would have shipped.
- **Subagent cost**: a claim-wrapped dispatch does not reduce a subagent's
  clarifying moves or the parent's verification cost relative to the plain
  brief.
