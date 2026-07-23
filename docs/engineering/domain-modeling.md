# domain-modeling

Reach shared understanding on decisions and concepts before any artifact or
implementation.

## Use

When fog must sharpen before work can proceed — either many user-owned decisions
are open (a frontier-round interview) or one name, product concept, or durable
architecture decision is actively contested (concept resolution). It ends at a
real boundary used by people or code, not at a better paragraph.

## Boundary

It only sharpens. `$implement` owns production writes, `$to-spec` owns synthesis,
`$slice-work` owns decomposition. It records an ADR or glossary entry only when a
decision is hard to reverse, surprising without context, and chosen through a real
trade-off — routine implementation is never frozen as architecture.

## Inputs

Either an open decision tree (many ready decisions with partly-settled
prerequisites) or a single contested meaning (the competing interpretations, public
seam, owner and consumers, observed contradiction, trade-off, and change
authority).

## Output

A confirmed decision ledger (frontier interview) or a canonical model with
invariants, excluded meanings, owned seams, stale vocabulary, first migration
slice, and falsifier (concept resolution). Completion requires an executable
decision or bounded handoff, not an unverified adoption claim.

## Composition

Uses `$source-to-decision` when an external source must justify the choice; hands
authorized production work to `$implement`; and feeds settled understanding to
`$to-spec`, `$slice-work`, or `$wayfinder`.
