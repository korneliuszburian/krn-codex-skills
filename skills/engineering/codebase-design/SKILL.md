---
name: codebase-design
description: Find architecture hotspots or deepen a module interface, public seam, or dependency shape. Use for growing monoliths, behavior ownership, or testability through production seams; skip routine implementation and fixed-point review without an architecture question.
---

# Codebase Design

Design deep modules: substantial behavior behind a small interface at a clean
seam. Callers and tests should learn the same surface.

## Choose The Mode

- **Directed design** — the caller, module, or interface is already named. Use
  the design questions below.
- **Architecture audit** — the user asks where monoliths, friction, or
  deepening opportunities exist. Load
  [architecture-audit.md](references/architecture-audit.md), rank candidates,
  then apply the design questions only to the strongest candidate.

An audit is read-only unless the user also authorizes implementation.

## Vocabulary

**Module** — anything with an interface and implementation: function, class,
package, or tier-spanning slice.

**Interface** — everything a caller must know, including invariants, errors,
ordering, configuration, and performance.

**Seam** — the location where behavior can vary without editing the caller.

**Adapter** — a concrete implementation that occupies a seam.

**Depth** — leverage delivered per unit of interface a caller must learn.

**Locality** — change, bugs, knowledge, and proof concentrated behind one
interface instead of repeated across callers.

Load [deep-modules.md](references/deep-modules.md) when comparing module shapes
or deepening an existing cluster.

## Design Questions

1. Who is the real caller and what outcome does it need?
2. What is the smallest interface that gives that caller the outcome?
3. Which complexity can move behind the interface?
4. Which policy has one owner after the change?
5. Is the seam real because behavior varies, or hypothetical?
6. Can production callers and proof both cross the same interface?
7. What disappears if the module is deleted?

For a consequential interface, sketch two meaningfully different designs
before choosing. Compare caller knowledge, hidden complexity, locality, failure
modes, and migration cost.

## Stop Condition

Stop when one interface has a named caller, hidden policy, stable observable
behavior, a credible proof surface, and fewer concepts than the alternatives.

## Hard Boundaries

- One adapter is evidence for a concrete implementation, not an automatic
  abstraction.
- Pass-through wrappers, mapper chains, and storage-shaped public types are
  shallow until they hide real policy.
- Testability improves by changing the production interface, not by exporting
  internals only for tests.
