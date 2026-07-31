---
name: code-review
description: Review a fixed-point diff, pull request, or working tree without editing it. Use for independent Standards and Spec checks of changed code; skip implementation, diagnosis, and unscoped codebase exploration.
---

# Code Review

Freeze the change before judging it. Review one resolvable surface on two
independent axes — **Standards** and **Spec** — then return only findings that
survive current-code verification. This skill never edits the reviewed work.

1. **Pin the fixed point.** Resolve a supplied commit, branch, tag, PR base, or
   merge base before reading conclusions into the diff. Inspect its three-dot
   diff and commit list. Fingerprint the base and head with immutable commit
   object ids. For a working tree, fingerprint HEAD plus the exact staged,
   unstaged, and in-scope untracked contents; a branch name or `git status`
   summary is not an identity.

   <review-surface>
   Target:
   Base source and fingerprint:
   Head source and fingerprint:
   Commit list:
   Staged paths:
   Unstaged paths:
   Untracked paths:
   Generated paths:
   Explicitly out of scope:
   </review-surface>

   Build a path ledger and mark every entry `reviewed`, `generated`, or
   `out-of-scope-with-reason`. Stop on an invalid ref or an empty surface. If
   the working tree changes during review, re-pin it before returning findings. Derive
   the fixed point from current branch or PR context when possible; ask for it
   only when that context cannot resolve the comparison.

   **Done when:** the exact comparison is reproducible and every changed path
   has a review disposition.

2. **Locate and fingerprint both authorities.** Find the Spec in this order: the user request,
   active tracker acceptance, linked issue or product/design artifact, then an
   explicit statement that no further spec exists. Load the closest repository
   instructions and only the domain material needed by the changed boundary.

   Read [review-standards.md](references/review-standards.md) after repository
   rules for the fallback baseline and review-lane precedence. Its baseline
   never overrides a closer rule.

   Fingerprint each authority by its stable source identity and immutable
   revision; when no revision exists, hash the exact bounded content used for
   review. Preserve source order for Standards because closer instructions have
   precedence.

   <review-fingerprint>
   Base fingerprint:
   Head fingerprint:
   Spec source and fingerprint:
   Ordered Standards sources and fingerprint:
   </review-fingerprint>

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

   **Done when:** base, head, Spec, and Standards have reproducible
   fingerprints; each requirement and standard has a named authority; and no
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

   **Done when:** every retained finding is actionable from the returned result and
   every executed gate can disagree with a specific review claim.

5. **Return findings without repairing.** Lead with Standards and Spec findings,
   ordered by severity within each axis. If an axis has none, say so and name
   its residual proof gap. Never collapse the axes into a score.

   <review-summary>
   Base / head / Spec / Standards fingerprint:
   Changed paths accounted for:
   Standards result:
   Spec result:
   Checks observed or run:
   Verification gaps:
   Residual risk:
   </review-summary>

   A finding authorizes no edit. Hand any accepted repair to a separate scoped
   implementation task. The initiating workflow owns any explicitly requested
   persistence; this read-only reviewer neither chooses a documentation path
   nor changes its own fixed point.

   If any member of the four-part fingerprint changes before disposition, this
   result is stale and the new fixed point requires a fresh review; findings do
   not carry forward by assumption.

   **Done when:** every in-scope path is accounted for, both axes remain
   visible, uncertainty is explicit, and the reviewed source is unchanged.
