# Lifecycle transitions

This table is the harness. For one accepted outcome it names the smallest owner
of the one unresolved condition and that owner's return boundary. The delivery
loop selects a handler from here and stops at its return. Skill descriptions
admit work to the platform; this table selects within the lifecycle.

The repository-scoped harness baseline is derived from the handler column: a
skill enters the baseline only when a transition names it, and `npm run
validate` fails when the table and the baseline disagree. Companions are
cross-cutting and never own a transition.

| Unresolved condition | Handler | Return boundary |
|---|---|---|
| The user explicitly requests a tracker-backed route map for an unclear effort spanning sessions | `wayfinder` | one open map with a named frontier/blocker, or one closed map with an exact terminal owner |
| A plan or decision needs adversarial sharpening before commitment | `grilling` | a sharpened plan or decision and shared understanding; no production mutation |
| A user-owned choice or contested concept blocks progress | `domain-modeling` | an executable decision or bounded handoff to its named consumer |
| External evidence must change a named local decision | `source-to-decision` | `adopt`, `reject`, `lab-test`, or `defer` for that consumer and falsifier |
| A seam, interface, or ownership decision is unresolved | `codebase-design` | one chosen boundary, bounded first slice, or decision-only handoff |
| A disposable runnable experiment can answer one design question | `prototype` | a verdict in the current owner and no unapproved production residue |
| Success is agreed, every implementation gate is settled, but the first written spec does not exist | `to-spec` | one destination-first spec with source links and no gating unknowns, routed to `implement` or `slice-work` |
| A settled written spec needs several demonstrable units or migration stages | `slice-work` | an implementation-ready list routed one unit at a time to `implement`, where each unit names the check that decides it before work starts |
| A failure's cause is unknown | `diagnosing-bugs` | a proven cause routed to `implement` only with repair and mutation authority, otherwise a bounded diagnosis |
| One scoped change or proven repair is clear | `implement` | production behavior plus proportional proof; when `implement` is explicit-only and unattached, a mechanical or single-seam scoped change may proceed directly under the proof budget, while non-mechanical or multi-file work asks for `$implement` |
| A diff, PR, or fingerprinted working tree needs read-only judgment | `code-review` | Standards and Spec disposition on one fixed point |
| A repository needs its one-time local contract adoption or repair | `setup-repository-workflow` | a thin managed contract and ignored runs boundary; setup stops |
| The user requests ownership of an already-agreed outcome through all authorized transitions | `delivery-loop` | lifecycle truth, one current owner, the configured queue's frontier and `krn ticket` claim/close/fail state, and the actual outcome/publication state |

Each handler keeps its manifest invocation mode; an explicit-only handler
requires the user to attach it by name. Do not add a handler for a condition
that already has an owner, and do not add a baseline skill without naming its
transition.

## Companions

Cross-cutting, selected beside a transition; they never own one:

- `target-repo-work` — identity and authority before crossing into another checkout.
- `typescript-engineering` — sharpens TypeScript work beside implementation, diagnosis, design, or review.
- `opencode-second-opinion` — explicit non-editing advisory pass over one path; returns prose, never a patch.
