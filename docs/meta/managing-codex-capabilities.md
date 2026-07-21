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

Reports keep `declared`, `discovered_candidate`, `configured_enabled`, and
`observed_used` separate. Missing usage is `no_evidence`; current-session
loading is `unknown`; app connection and scopes are `report-only` until their
actual owner supplies evidence.

## Composition

Uses the `krn-codex-catalog` executable. Skill design changes belong to
`$writing-great-skills` instead.
