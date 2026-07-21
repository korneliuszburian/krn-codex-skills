# Setup Repository Workflow

## Purpose

Adopt or repair a thin repository-local agent contract without copying global
workflows or creating a permanent orchestrator.

## Invocation

Explicit only as `$setup-repository-workflow`.

## Use and skip

Use once for repository workflow adoption, condensation, or repair. Skip normal
delivery and global capability installation.

## Inputs

Repository and ref, operator outcome, existing instruction and tracker owners,
write authority, tracker and domain mode, delivery profile, and publication
boundary.

## Output and completion

An idempotent local contract, normalized `docs/agents/` artifact boundary, and
only mechanically earned guards. Completion requires a fresh session to find
the current outcome and commands while a second apply is byte-identical.

## Composition

Uses `$target-repo-work` when crossing repositories. After setup, ordinary
work routes to `$implement`, `$diagnosing-bugs`, or `$code-review`; setup has no
continuing runtime role.
