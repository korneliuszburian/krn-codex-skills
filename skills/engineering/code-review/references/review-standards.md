# Review Standards

Use this baseline only after loading the closest repository rules. A smell is
not a finding until the current diff demonstrates a violated rule, behavior
risk, or concrete maintenance cost.

<actionable-standard>
Rule or contract:
Current diff evidence:
Affected caller or behavior:
Concrete cost:
Counterexample that would dismiss it:
</actionable-standard>

## Review Lane Precedence

One fixed point gets one routine local lane: `$code-review`. Additional lanes
run only for their distinct trigger and never upgrade advisory output into
approval:

1. `$code-review` owns the routine fixed-diff Standards and Spec result.
2. Host review owns comments on an existing pull or merge request; it does not
   replace local Spec review or imply approval.
3. `$second-opinion-review` runs only when an explicit high-risk challenge or
   bounded external evidence pass is requested; its result remains advisory.
4. The initiating workflow or human dispositions findings and decides the next
   action after every lane.

If two routes appear to own the same routine review, keep `$code-review` and
drop the duplicate. A host-required check remains host policy, not a second
local workflow owner.

## Boundary And Proof Checks

- Does external data remain `unknown` until runtime validation?
- Is there one public model instead of aliases, compatibility shims, or
  duplicate read models?
- Does proof observe the highest stable public seam with an independently
  derived expected result?
- Does persistence or migration work include executable readback and a
  contraction or rollback path?
- Are behavior proof, CI, review, and publication reported as separate facts?
- Does every changed line serve the requested slice?
- Did the slice remove only artifacts it made obsolete?
- Are tests protecting a behavior or authority boundary rather than prose,
  file topology, private call order, command lists, tautological expected
  values, or implementation ceremony?

## Concrete Design Costs

Report these only when changed paths show the cost:

- **Mysterious name** — a public name hides the concept it owns.
- **Duplicated policy** — one decision is implemented in multiple owners.
- **Message chain or feature envy** — a caller sequences another module's
  internals instead of asking one interface for an outcome.
- **Data clump or primitive obsession** — recurring values are an unnamed
  domain concept.
- **Repeated switch** — one state dispatch is scattered across owners.
- **Shotgun surgery** — one behavior needs unrelated caller edits.
- **Divergent change** — one module owns unrelated policies.
- **Speculative generality** — an option, hook, adapter, or abstraction has no
  current consumer.
- **Middle man** — a pass-through layer enlarges the interface without hiding
  complexity.
- **Context sediment** — always-loaded instructions duplicate workflow or
  preserve stale history.

## TypeScript Branch

Use these checks only when TypeScript source, declarations, or compiler
configuration changed:

- Are implementation details inferred while public and IO boundaries remain
  explicit?
- Are exclusive states discriminated instead of modeled as optional bags?
- Are derived types coupled only when their owners evolve together?
- Could `satisfies` or narrowing replace an assertion?
- Is every `any`, double assertion, predicate, assertion function, ambient
  declaration, or suppression isolated and justified?
- Does proof separate compile-time relationships from runtime validity?
