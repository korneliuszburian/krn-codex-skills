# Facts and status — nothing is rediscovered

The point of the architecture stage is that once something is decided, no agent
re-derives it. Facts live in the project; process rules live as lessons.

## Project facts (`docs/design/`)

| File | Holds | Owner |
|---|---|---|
| `raw/variables.json`, `raw/metadata.txt` | raw MCP dumps, kept out of chat | architecture |
| `resolutions.md` | `accepted`/`no-change`/`unresolved` design findings and the supplying decision owner | architecture |
| `tokens.md` | every design value, its snapped token, deviations | architecture |
| `sections.md` | every section of every page, with occurrence counts | architecture |
| `components.md` | the block × variant × optionals matrix | architecture |
| `blocks.md` | per-block status: `planned` → `built` → `verified` | build |

These are the source of truth. Chat history and the native Goal are not.

## Figma intake facts (from real runs)

- The Figma MCP answers inside a JSON envelope (`content[] → text`); unwrap it
  before parsing — `krn-codex frontend design` does this, so feed it the raw
  dump instead of hand-reading it.
- `get_variable_defs` needs a **frame** node. Asking about the canvas (`0-1`)
  answers "You currently have nothing selected", which reads like "the design has
  no variables" but means "pick a frame".
- A file may publish almost nothing. Bloom published one variable (`Yellow`)
  while the design system's accent was a near-match but a different value
  (`#FCCD26` vs `#ffcf33`). THEN the facts fall back to the design system the
  design ships and record the deviation — never invent a scale to fill the gap.
- In `get_metadata` output, `<frame>` is a layout region and `<instance>` is a
  component use: count instances per name for the component usage matrix
  (`Button ×18`), and never read a section frame as a component.
- Evidence: `test/frontend/frontend.test.mjs::parseDesign unwraps the MCP
  envelope into tokens, sections, and components`; `scripts/lib/frontend/design.mjs`.

## The registry is machine-checked

- `krn-codex frontend audit --root <theme> --docs docs/design/blocks.md` (the
  project's `frontend:audit`) fails when a row marked `built` or `verified` has no
  `src/css/blocks/<slug>.css`. Rows marked `reuse` or `built inside <other>` are
  exempt on purpose.
- Therefore a block is `built` only when its own file exists. A block whose styles
  live inside a section file is not built — it is a `block-ownership` failure, and
  the registry must not claim it.
- `krn-codex frontend facts --root <theme> --docs docs/design` (the project's
  `frontend:facts`) checks the other three facts against the code: every matrix
  variant in `components.md` must appear in that block's CSS or its template, a
  `reuse` cell must resolve to a real composition or block, a `sections.md` row
  must map to a known block or composition, and every token named in a
  `tokens.md` table must exist in the built CSS (an unbuilt project reports a
  soft finding instead).
- Run both commands after touching the facts or the code. A fact file that
  disagrees with the code is a defect, not documentation drift.

## The freeze rule

- A block is `verified` only after its acceptance check passes (browser evidence).
- A `verified` block is **frozen**: an edit needs a new acceptance criterion and a
  falsifier, not a drive-by change. Reworking a finished block is the failure the
  architecture stage exists to prevent.

## When to add a lesson

Add a cross-run lesson (in this repository's lessons page) only when the same
friction recurs or would be expensive to repeat — e.g. a design convention that
keeps biting, or a consolidation decision that was wrong. A lesson needs
evidence, a gate or owner, and a trigger; it is not a place for one-off notes.

## Exit

A new session can read `resolutions.md`, `tokens.md`, `sections.md`,
`components.md`, and `blocks.md` and know what to build next without reading
history or the design again for anything already decided.
