---
name: code-review
description: Review a fixed-point diff, pull request, or working tree without editing it. Use for independent Standards and Spec checks of changed code; skip implementation, diagnosis, and unscoped codebase exploration.
---

# Code Review

Review the change on two independent axes:

- **Standards** — does the implementation respect current repository and
  engineering rules?
- **Spec** — does it deliver the requested behavior without omissions or scope
  creep?

Passing one axis cannot hide failure on the other.

## Process

### 1. Pin The Surface

For a supplied commit, branch, tag, or merge base, resolve it before review and
inspect the three-dot diff plus commit list.

For a working tree, inspect status, staged and unstaged diffs, and every
in-scope untracked file. Build a changed-path ledger and mark each path
reviewed, generated, or explicitly out of scope.

Stop early on a bad ref or empty surface. Ask for a fixed point only when the
request cannot be resolved from current branch or PR context.

### 2. Locate Authority

Find the Spec in this order:

1. user request;
2. active tracker acceptance;
3. linked issue, PRD, or design;
4. explicit confirmation that no spec exists.

Load the closest `AGENTS.md`, contributing rules, and only the domain material
needed by the changed boundary. Load
[review-standards.md](references/review-standards.md) for the Standards axis.

### 3. Run Independent Axes

Run Standards and Spec without sharing conclusions. For a substantial diff,
use two bounded read-only subagents in parallel when independent context would
improve signal; otherwise perform the same passes sequentially.

Standards checks documented rules, public seams, strict boundaries, migrations,
proof quality, naming, and concrete design costs.

Spec checks missing or partial requirements, wrong behavior, scope creep, and
claims unsupported by the diff.

### 4. Verify Findings

Reopen every cited file and current line. Drop a finding that:

- lacks current path and line evidence;
- is only a style preference with no documented rule or concrete cost;
- is already settled by deterministic tooling and has no distinct behavior
  risk;
- invents a requirement absent from the Spec.

Each retained finding needs severity, evidence, impact, and the smallest
credible fix.

### 5. Report Without Editing

```text
Scope and fixed point:
Changed paths accounted for:
Standards findings:
Spec findings:
Verification gaps:
Residual risk:
```

Put findings first and order severity within each axis. If an axis has no
finding, say so and name its residual proof gap. Do not merge the axes into one
score.

## Stop Condition

Stop when every in-scope path is accounted for, both axes have an independent
result, every finding survives current-code verification, and uncertainty is
explicit.

## Hard Boundaries

- Review is read-only; fixing begins in a separate authorized task.
- Include staged, unstaged, and untracked work when reviewing a working tree.
- Green tests do not prove Spec compliance or design quality.
- A smell is a judgment call until a rule or concrete behavior risk makes it
  actionable.
