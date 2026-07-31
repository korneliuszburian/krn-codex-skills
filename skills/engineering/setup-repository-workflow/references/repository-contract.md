# Repository Contract Placement

Use the narrowest durable surface that matches the scope.

| Surface | Owns | Does not own |
|---|---|---|
| prompt or native goal | one outcome and current authority | shared repository policy |
| native plan | ephemeral execution steps | backlog or durable status |
| global `AGENTS.md` | reusable personal engineering defaults | product language and commands |
| repository `AGENTS.md` | layout, commands, domain boundaries, required gates | copied global workflow prose or history |
| nested `AGENTS.md` | subtree-specific differences | restating the root contract |
| `.codex/config.toml` | trusted repository Codex settings | workflow instructions |
| repository tracker | durable queue, dependencies, claims, closure | session reasoning or documentation |
| skill | one repeated task workflow | repository status or domain inventory |
| hook | deterministic lifecycle interception | judgment, orchestration, or review |
| CI | reproducible checks on a fixed revision | product completion or host policy |
| GitHub settings | required checks, branch protection, merge and review policy | local implementation procedure |

Keep resumable workflow state under the canonical ignored
`.krn/runs/<workflow>/<run-id>/`; the creating workflow owns cleanup when the
named sole in-goal consumer finishes its accepted outcome or the owning Goal
closes, whichever comes first. Short-lived findings return to the active outcome
owner. Put only the workflow-specific state needed for a later session inside
its run; prompts, packets, logs, and raw model output are transport, not durable
knowledge. Only `$delivery-loop` persists the outcome capsule at
`.krn/runs/delivery-loop/<outcome-id>/state.md`; every other workflow uses the
Goal/tracker for continuation or hands lifecycle ownership to it. Cross-Goal
continuation transfers condensed truth into the successor-owned run before
cleanup. For a superseded or abandoned delivery run, transfer alone is not
consumer completion; retain the original until its Goal's non-active state is
read back.

Durable knowledge has semantic owners rather than a generic report directory:

- `CONTEXT.md` holds current shared vocabulary only when a real consumer needs it;
- `docs/adr/` holds earned consequential decisions;
- `docs/research/` holds an explicitly retained synthesis with a named consumer;
- the configured tracker holds active outcomes, specifications, tickets, and state.

Do not create these paths during setup. The domain, decision, research, or
tracker workflow creates its own artifact only when its retention trigger is
present.

Prefer deletion or a direct pointer when two artifacts communicate the same
current state. A compatibility symlink may share one semantic instruction file;
two maintained copies may not.

Custom agents are resource and isolation profiles for delegated work. Add one
only when its model, sandbox, tools, or narrow independent job differs from the
parent. A new name for `$implement` or `$code-review` is not a distinct agent
contract.

Mechanical enforcement must name the invalid state it rejects. File counts,
required prose snapshots, mandatory documentation churn, and CI jobs that only
test their own fixture are not evidence that repository delivery works.

When the repository explicitly needs review-gated, multi-commit delivery, a
strict local profile may require one outcome branch, cohesive Conventional
Commits, one PR, fresh required CI, linear history, and squash merge. Keep the
PR number on the durable squash commit instead of forcing it into every inner
commit. CODEOWNERS and automated review are advisory unless the host ruleset
requires an approval, resolved thread, or named review status.
