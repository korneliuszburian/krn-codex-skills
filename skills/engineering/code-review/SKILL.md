---
name: code-review
description: Review a fixed-point diff, pull request, or working tree without editing it. Use for independent Standards and Spec checks of changed code; skip implementation, diagnosis, and unscoped codebase exploration.
---

# Code Review

Freeze the change before judging it. Review one resolvable surface on two
independent axes — **Standards** and **Spec** — then report only findings that
survive current-code verification. This skill never edits the reviewed work.

1. **Pin the fixed point.** Resolve a supplied commit, branch, tag, PR base, or
   merge base before reading conclusions into the diff. Inspect its three-dot
   diff and commit list. For a working tree, include status, staged and
   unstaged diffs, and every in-scope untracked file.

   <review-surface>
   Target:
   Base and comparison:
   Commit list:
   Staged paths:
   Unstaged paths:
   Untracked paths:
   Generated paths:
   Explicitly out of scope:
   </review-surface>

   Build a path ledger and mark every entry `reviewed`, `generated`, or
   `out-of-scope-with-reason`. Stop on an invalid ref or an empty surface. If
   the working tree changes during review, re-pin it before reporting. Derive
   the fixed point from current branch or PR context when possible; ask for it
   only when that context cannot resolve the comparison.

   **Done when:** the exact comparison is reproducible and every changed path
   has a review disposition.

2. **Locate both authorities.** Find the Spec in this order: the user request,
   active tracker acceptance, linked issue or product/design artifact, then an
   explicit statement that no further spec exists. Load the closest repository
   instructions and only the domain material needed by the changed boundary.

   Read [review-standards.md](references/review-standards.md) after repository
   rules to fill gaps on the Standards axis. Its baseline never overrides a
   closer rule.

   <review-authority>
   Requested result:
   Spec source:
   Standards sources:
   Relevant durable context loaded:
   Context deliberately excluded and why:
   Changed public boundary:
   Acceptance claims:
   Exact proof commands and results:
   Known proof gaps and non-proofs:
   Authority and publication state:
   Explicit non-goals:
   </review-authority>

   **Done when:** each requirement and standard has a named authority, and no
   test result or reviewer preference is standing in for one. The packet is
   complete for the decision while excluding unrelated history, backlog, and
   repository-wide prose that would bury the relevant evidence.

3. **Run the axes independently.** On **Standards**, inspect documented rules,
   public seams, external and type boundaries, migrations, naming, proof
   quality, and concrete design costs. On **Spec**, inspect missing or partial
   behavior, wrong outcomes, scope creep, and claims unsupported by the diff.

   For a substantial surface, run the two bounded read-only passes in separate
   contexts. If the surface is small or isolation is unavailable, label
   sequential execution as a degraded fallback, reset the authority and path
   ledger between axes, and do not carry candidate findings across.

   <axis-result>
   Axis: Standards | Spec
   Context: isolated | sequential-degraded
   Paths inspected:
   Claims checked:
   Candidate findings:
   Verification gaps:
   </axis-result>

   Passing one axis cannot compensate for failure on the other.

   **Done when:** both axes have inspected the whole in-scope ledger and
   produced separate candidate findings or an explicit no-finding result.

4. **Try to kill every finding.** Reopen the cited path and current line. Drop
   a candidate that lacks current evidence, invents a requirement, expresses
   preference without a documented rule or concrete cost, or duplicates a
   deterministic tool result without a distinct behavior risk.

   A finding that needs runtime support may reuse or run the cheapest focused
   observer that can falsify it. Do not expand read-only review into general
   gate execution, and do not restate a deterministic tool finding unless it
   exposes a distinct behavior risk.

   <review-finding>
   Axis: Standards | Spec
   Severity and affected behavior:
   Current path and line:
   Authority or violated contract:
   Evidence:
   Impact:
   Smallest credible fix:
   Falsifying check, if needed:
   </review-finding>

   **Done when:** every retained finding is actionable from the report and
   every executed gate can disagree with a specific review claim.

5. **Report without repairing.** Lead with Standards and Spec findings,
   ordered by severity within each axis. If an axis has none, say so and name
   its residual proof gap. Never collapse the axes into a score.

   <review-summary>
   Fixed point:
   Changed paths accounted for:
   Standards result:
   Spec result:
   Checks observed or run:
   Verification gaps:
   Residual risk:
   </review-summary>

   A finding authorizes no edit. Hand any accepted repair to a separate scoped
   implementation task. If a named consumer requires a persisted report, the
   parent workflow stores it after review under the repository's configured
   retained-report role (normally `docs/agents/reports/code-review/`); this
   read-only reviewer never changes its own fixed point.

   **Done when:** every in-scope path is accounted for, both axes remain
   visible, uncertainty is explicit, and the reviewed source is unchanged.
