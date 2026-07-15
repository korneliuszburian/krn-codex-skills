# Deep Modules

Judge module depth by leverage: useful behavior hidden per unit of interface a
caller must learn. Count caller knowledge and repeated policy, not files or
lines.

## Run The Deletion Probe

Imagine deleting the module:

- if complexity vanishes, it was likely ceremony or a pass-through;
- if policy, sequencing, and special cases spill into many callers, the module
  was earning locality.

Deletion is a design probe, never an instruction to remove current code.

## Measure Interface Pressure

A shallow interface leaks storage columns, transport envelopes, ordered method
sequences, implementation-owned configuration, repeated error recovery, or
adapter chains that expose pipeline history.

A deep interface accepts the caller's domain input, owns sequencing and
policy, and returns the useful result or a discriminated failure.

<module-shape>
Caller outcome:
Interface the caller learns:
Sequencing and policy hidden:
Failure contract:
Knowledge still leaked:
Locality gained:
</module-shape>

## Require Seam Evidence

Use a seam when at least one statement is already true:

- two real implementations vary;
- an external boundary must be isolated;
- stable policy should stop repeating across callers;
- an irreversible dependency needs a contraction point.

A future adapter with no current consumer does not earn a seam.

Return to step 4 with this evidence and compare ownership shapes. Choose the
smallest caller contract that still owns the real policy. A larger
implementation is often the better design when it buys a much smaller,
steadier interface.
