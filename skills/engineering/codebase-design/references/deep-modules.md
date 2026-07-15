# Deep Modules

## Deletion Test

Imagine deleting the module:

- if complexity vanishes, it was likely ceremony or a pass-through;
- if policy and special cases spill into many callers, the module was earning
  locality.

Deletion is a design probe, not a command to remove current code.

## Interface Pressure

A shallow interface leaks:

- storage columns or transport envelopes;
- several methods that callers must sequence correctly;
- configuration owned by the implementation;
- error recovery every caller repeats;
- adapter chains that expose pipeline history.

A deep interface accepts the caller's domain input, owns sequencing and policy,
and returns the caller's useful result or discriminated failure.

## Seam Evidence

Use a seam when at least one is true:

- two real implementations already vary;
- a true external boundary must be isolated;
- the seam owns a stable policy that callers should not repeat;
- an irreversible dependency deserves a contraction point.

Avoid a seam justified only by a hypothetical future adapter.

## Design It Twice

For a consequential boundary, compare at least two designs that differ in
ownership, not just naming:

```text
Design:
Caller knowledge:
Behavior hidden:
Failure model:
Proof surface:
Migration cost:
Deletion result:
```

Choose the design with the smallest caller contract that still owns the real
policy. A slightly larger implementation is acceptable when it buys a much
smaller interface.
