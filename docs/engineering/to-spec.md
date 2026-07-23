# to-spec

Compress one settled conversation into a destination-first spec and publish it.

## Use

When the outcome is already agreed in conversation but no spec exists. It
synthesizes what was settled into a single spec — problem and solution from the
user's perspective, acceptance at the highest existing public seam, resolved
implementation decisions, and explicit unknowns — then publishes it once to the
configured tracker.

## Boundary

It synthesizes; it never interviews and never decomposes. `$batch-grill-me` and
`$domain-modeling` own sharpening and vocabulary, `$slice-work` owns slicing, and
`$implement` owns the build. If a gating decision is still fog, it stops and
routes there instead of freezing the wrong destination.

## Inputs

A settled conversation with resolved decisions and explicit non-goals, plus
codebase understanding of the boundary the outcome touches.

## Output

One destination-first spec, published once to the location in
`docs/agents/issue-tracker.md` (or `.scratch/<feature>/spec.md` when no tracker
is configured) and linked from the tracker item that drives implementation. It
becomes the input `slice-work` pins.

## Composition

Hand the published spec to `slice-work` for a multi-slice outcome, or directly
to `implement` for a single change, sequenced by `delivery-loop`.
