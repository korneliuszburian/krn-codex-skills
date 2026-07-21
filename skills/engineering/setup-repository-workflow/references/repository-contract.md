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

Normalize workflow artifacts inside every configured repository:

- `docs/agents/runs/<workflow>/<run-id>/` for ignored working material owned
  and cleaned up by the creating workflow;
- `docs/agents/reports/<workflow>/<slug>.md` only for a final synthesis,
  decision, or owner-facing report with a named durable consumer.

This separation keeps research and second-opinion work discoverable without
mutating the diff it is reviewing or turning raw logs into permanent docs.
Resolve every role through `docs/agents/artifact-paths.json`; individual skills
must not invent a competing repository path.

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
