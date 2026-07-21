# Source to Decision

## Purpose

Turn external evidence into one owned disposition: adopt, reject, lab-test, or
defer.

## Invocation

Model-invocable or explicit as `$source-to-decision`.

## Use and skip

Use when documentation, a paper, practitioner material, or supplied source
must change a local engineering decision. Skip simple fact lookup and purely
local code inspection.

## Inputs

A decision question, consumer, owner, current local behavior, evidence
threshold, relevant versioned sources, and non-proof boundary.

## Output and completion

A source-to-mechanism-to-project chain, chosen disposition, provenance,
falsifier or experiment, and bounded owner handoff. Completion requires the
disposition to survive a local counterexample attempt.

## Composition

Hands an authorized adoption slice to `$implement`; it does not implement the
source recommendation itself.
