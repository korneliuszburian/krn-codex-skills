# Managing Codex Capabilities

## Purpose

Reconcile global skills, plugins, MCP servers, and related app visibility
through one reviewed capability profile.

## Invocation

Model-invocable or explicit as `$managing-codex-capabilities`.

## Use and skip

Use for capability inventory, usage evidence, stale overrides, profile changes,
or collisions. Skip project-local skills and ordinary skill authoring.

## Inputs

Requested outcome, inventory, optional bounded usage window, selected profile,
planned changes, quarantine rules, and any report-only connector follow-up.

## Output and completion

A dry-run plan or atomically applied profile with backup, immediate check, and
fresh-session verification. Account-connected apps remain outside local TOML
authority.

## Composition

Uses the `krn-codex-catalog` executable. Skill design changes belong to
`$writing-great-skills` instead.
