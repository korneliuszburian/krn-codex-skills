# AGENTS.md

## Repository Contract

This repo defines a Codex-native agentic coding setup. Keep the system small, composable, and verified in practice.

## Working Agreements

- Use repo-local Codex surfaces: `.codex/skills`, `.codex/agents`, `.codex/config.toml`, and `AGENTS.md`.
- Do not copy Claude-specific paths or assumptions directly; translate them to Codex.
- Prefer concise skills with progressive disclosure over large always-loaded instructions.
- Treat `inspirations/` as source material, not as runtime configuration.
- Before editing, state the current bead, expected files, and proof.
- Verify changes with exact commands. If verification is blocked, say what blocked it.
- Keep names short and practical. Avoid branding prefixes unless they clarify triggering.

## Skill Map

- `$coding-system`: top-level workflow for turning intent into verified delivery.
- `$grill`: stress-test plans against project language, code reality, `CONTEXT.md`, and ADRs.
- `$debug`: bugs, broken runtime, stack traces, regressions, and reproduction-first fixes.
- `$implementation`: surgical feature/refactor/config implementation.
- `$review`: defect-oriented review before shipping or after subagent work.
- `$handoff`: compact continuation context for reset, compaction, or delegation.

## Proof Levels

Use the proof level that matches the claim: static, unit, integration, runtime, rendered, or remote. Never present lower-level proof as higher-level proof.

## Safety

- Do not run destructive git commands unless the user explicitly asks.
- Do not overwrite unrelated user changes.
- Do not add production dependencies without checking existing repo patterns and explaining the reason.
