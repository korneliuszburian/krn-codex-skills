---
name: frontend-stage
description: Enter the frontend stage — read the project facts, place the work in design intake, architecture, build, or verify, and apply each exit criterion and the per-section acceptance. Use at the start of a frontend task or when resuming one.
---

# The frontend stage — start here

The stage is a sequence, not a menu: design intake → architecture → build →
verify. Each stage has an owner and an exit criterion; the next stage must not
start before the previous exit is met. Facts live in the project
(`docs/design/`), not in chat history.

## <required> — before any frontend work

1. IF the project has `docs/design/` THEN read `tokens.md`, `sections.md`,
   `components.md`, and `blocks.md` first. NEVER re-derive a decided value from
   the design or start from a screenshot.
2. IF the facts are missing, or `raw/` is newer than them, THEN you are at
   **intake**: run the design commands before writing any CSS.
3. State the stage and the next action in one line before editing. NEVER start in
   the middle of the stage.

## The stages

| Stage | Enter when | Do | Exit criterion | Owner |
|---|---|---|---|---|
| Intake | `raw/variables.json` / `raw/metadata.txt` exist without facts | Run `krn-codex frontend design --variables <raw> --metadata <raw>`; write `tokens.md`, `sections.md`, `components.md`; record every deviation | Every design value has a token or a recorded deviation; every section and component is counted | `$frontend-architecture` |
| Architecture | Facts exist, the build plan is open | Consolidate repeats into blocks + variants; fix the block × variant × ACF matrix; decide reuse vs new; set the build order | `blocks.md` has a status and an acceptance per row; no open reuse-vs-new question | `$frontend-architecture` |
| Build | The plan is frozen | Re-theme tokens first (the kitchen sink must look right with zero block CSS), then compositions → utilities → blocks as thin skeletons copied from the library | `npm run lint:css` and `npm run frontend:audit` clean (every `--accept` has a recorded reason); `npm run build` green | `$frontend-tokens`, `$frontend-library`, `$frontend-components`, `$frontend-process` |
| Verify | The section renders | Run the per-section acceptance below; capture browser evidence; move the registry row to `verified` | Acceptance passed at both viewports (or a recorded bound); the row is `verified`; the block is frozen | `$frontend-enforcement`, `$frontend-process` |

## Per-section acceptance (definition of done for one section)

A section is done only when all of these hold; report each one as evidence:

1. Facts: a `sections.md` entry and a `blocks.md` row per block it introduces,
   with all four facts machine-checked against the code — `npm run frontend:facts`
   (matrix, sections, tokens) and `npm run frontend:audit` (policy) clean.
2. Ownership: every block it uses has its own `src/css/blocks/<slug>.css` — no
   block's styles hidden in the section file (`block-ownership` clean).
3. Policy: `npm run frontend:audit` clean, or each `--accept <rule>:<file>`
   carries a recorded reason in `docs/design/enforcement.md`.
4. Gates: `npm run lint:css` clean and `npm run build` green.
5. Evidence: browser evidence at both viewports, or an explicit bound naming why
   it could not be captured (missing tooling, no container) — never silently
   skipped.
6. Reachability: the layout is registered in `inc/flexible-content-layouts.php`
   and in the ACF group, so the section can actually appear on the page.
7. Status: the registry row moves `built` → `verified`; a `verified` block is
   frozen (an edit needs a new acceptance criterion and a falsifier).

## Handoffs

- Intake and architecture → `$frontend-architecture` (`references/facts.md`,
  `references/acf-mapping.md`).
- Palette and scale → `$frontend-tokens` (re-theme vs tweak).
- Copying or auditing the component set → `$frontend-library`.
- Writing a block → `$frontend-components` (`references/blocks.md`).
- Phase-by-phase build order inside Build → `$frontend-process`.
- Lint, audit, a11y, and CI gates → `$frontend-enforcement`.

## References

- `docs/research/frontend-delivery.md` — the source-backed synthesis behind this
  stage (model, quality bar, anti-patterns).
- `$frontend-architecture/references/facts.md` — what the facts files hold and
  how the registry is machine-checked.
