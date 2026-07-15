# Review Standards

Repository rules override this baseline. Skip a tooling-enforced issue unless
the diff still carries a distinct behavioral or design risk.

## Hard Questions

- Does external data remain `unknown` until runtime validation?
- Is there one public model instead of aliases, compatibility shims, or
  duplicate read models?
- Does the proof observe the highest stable public seam with an independent
  expected result?
- Does persistence or migration work include executable readback and a
  contraction or rollback path?
- Are semantic proof, CI, review, and publication reported separately?
- Does every changed line trace to the requested slice?
- Did the slice remove only artifacts it made obsolete?

## Concrete Smells

Report only when the diff demonstrates the cost:

- **Mysterious Name** — the public name hides the owned concept.
- **Duplicated Policy** — the same decision is implemented in multiple places.
- **Feature Envy / Message Chain** — a caller traverses another module's
  internals instead of using one interface.
- **Data Clump / Primitive Obsession** — recurring values represent an unnamed
  domain concept.
- **Repeated Switch** — one state dispatch is scattered across owners.
- **Shotgun Surgery** — one behavior requires unrelated edits across callers.
- **Divergent Change** — one module owns unrelated policies.
- **Speculative Generality** — an option, abstraction, hook, or adapter has no
  current consumer.
- **Middle Man** — a pass-through layer adds interface without hiding
  complexity.
- **Test Theater** — tests freeze internals, topology, prose, command lists, or
  tautological expected values.
- **Context Sediment** — always-loaded instructions repeat a workflow or carry
  stale history.

## TypeScript

- Are locals inferred while public and IO boundaries are explicit?
- Are exclusive states discriminated rather than optional bags?
- Are derived types coupled only when their owners evolve together?
- Could `satisfies` or narrowing replace an assertion?
- Is every `any`, double assertion, predicate, assertion function, ambient
  declaration, or suppression isolated and justified?
- Does the proof separate compile-time relationships from runtime validity?
