# Facts and status — nothing is rediscovered

The point of the architecture stage is that once something is decided, no agent
re-derives it. Facts live in the project; process rules live as lessons.

## Project facts (`docs/design/`)

| File | Holds | Owner |
|---|---|---|
| `raw/variables.json`, `raw/metadata.txt` | raw MCP dumps, kept out of chat | architecture |
| `tokens.md` | every design value, its snapped token, deviations | architecture |
| `sections.md` | every section of every page, with occurrence counts | architecture |
| `components.md` | the block × variant × optionals matrix | architecture |
| `blocks.md` | per-block status: `planned` → `built` → `verified` | build |

These are the source of truth. Chat history and the native Goal are not.

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

A new session can read `tokens.md`, `sections.md`, `components.md`, and
`blocks.md` and know what to build next without reading history or the design
again for anything already decided.
