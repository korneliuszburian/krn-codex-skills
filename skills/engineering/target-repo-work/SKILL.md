---
name: target-repo-work
description: Inspect, test, initialize, verify, or repair a repository other than the current source repo with explicit authority and dirty-state ownership. Use when commands or edits cross into another checkout; skip ordinary work inside the active repo.
---

# Target Repository Work

Cross-repository work begins by fixing identity, authority, and ownership. A
target test is evidence about that target, not automatic proof about the source
system.

## Select The Mode

| Mode | Target writes | Success |
|---|---:|---|
| `observation-only` | none | requested evidence captured, target source unchanged |
| `headless-repair` | named paths | scoped patch verified and handed off |
| `real-operator` | operator-controlled | genuine operator actions and outcome preserved |

Choose `observation-only` unless the user or originating contract explicitly
authorizes target writes. A failed observation does not grant repair authority.

## Process

### 1. Fix Target Identity

Record:

```text
source_repo:
target_repo:
target_ref:
mode:
requested observation or behavior:
allowed writes:
forbidden writes:
rollback:
```

Read the target's own instructions before target commands.

### 2. Capture Fresh State

Immediately before work, inspect the target's current branch and dirty state:

```text
target_dirty_before:
pre_existing_paths:
owned_by_this_run:
publication_authority:
```

If a previously clean target becomes dirty or ownership changes, downgrade to
observation-only until authority is renewed.

### 3. Execute The Mode

**Observation-only** may inspect files and run commands that do not intentionally
mutate source. Write reports in the source repo or a disposable location, not
the target.

**Headless repair** requires named paths, a rollback, separation of pre-existing
and current changes, focused verification, and an explicit handoff if the patch
remains dirty.

**Real operator** requires genuine operator input or a transcript. A headless
run cannot be relabeled after the fact.

### 4. Capture Evidence

Label each command as target evidence and state what it proves. Target tests do
not automatically prove source-repo correctness, complete verification,
product readiness, or second-operator usability.

Capture final target status and account for every path created or modified by
the run.

## Output

```text
Mode and authority:
Target identity:
Dirty state before/after:
Commands and observations:
Owned patch:
Proof:
Does not prove:
Rollback or handoff:
```

## Stop Condition

Stop when mode-specific success is met, target ownership remains unambiguous,
and every unresolved target mutation has a named owner and rollback.

## Hard Boundaries

- Preserve pre-existing dirty state.
- Use a separate worktree for concurrent writers.
- Keep credentials, user data, and irreversible external actions outside a
  headless trial unless explicitly authorized.
- Never transform observation failure into silent repair.
