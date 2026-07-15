---
name: typescript-engineering
description: Sharpen TypeScript inference, boundaries, public APIs, compiler configuration, and type-level proof. Use beside implementation, review, diagnosis, or design for .ts, .tsx, .d.ts, tsconfig, or module-resolution work; skip ordinary JavaScript and workflow sequencing.
---

# TypeScript Engineering

TypeScript is a model of JavaScript, not a runtime shield. Preserve useful
relationships in the compiler, validate values at runtime, and make every
unsound claim visible.

The active workflow skill still owns sequencing, edits, diagnosis, review, or
architecture. This companion owns the TypeScript decision inside that work.

1. **Pin the boundary.** Name what crosses it, who owns the contract, whether
   the value exists at runtime, and what may vary independently.

   <typescript-contract>
   Boundary: internal | public API | external input | persistence | module | compiler
   Runtime value:
   Type owner:
   Relationship to preserve:
   Unsound claim, if any:
   Cheapest static falsifier:
   Runtime falsifier, if required:
   </typescript-contract>

   **Done when:** the type is attached to a real consumer and its runtime
   limits are explicit.

2. **Load only the live branch.** Read the reference whose surface changed:

   - [inference-and-annotations.md](references/inference-and-annotations.md)
     for contextual inference, annotations, literals, and widening;
   - [objects-indexing-and-state.md](references/objects-indexing-and-state.md)
     for structural objects, keys, unions, and exhaustive states;
   - [functions-generics-and-callbacks.md](references/functions-generics-and-callbacks.md)
     for signatures, variance, overloads, predicates, and generic relations;
   - [type-transformations.md](references/type-transformations.md) for
     derivation, conditional, mapped, and template-literal types;
   - [runtime-boundaries-and-escape-hatches.md](references/runtime-boundaries-and-escape-hatches.md)
     for `unknown`, validation, assertions, and suppressions;
   - [public-apis-modules-and-declarations.md](references/public-apis-modules-and-declarations.md)
     for library surfaces, classes, modules, declarations, and augmentation;
   - [compiler-resolution-and-proof.md](references/compiler-resolution-and-proof.md)
     for tsconfig, emit, module resolution, JSX, project references, and proof.

   **Done when:** every loaded reference changes a current decision; branch-only
   material stays out of context.

3. **Preserve the relationship, not ceremony.** Infer implementation details.
   Annotate public inputs and independently owned contracts. Derive types when
   value and type share an owner; decouple them when their consumers evolve
   separately. Prefer a union or overload to clever machinery callers cannot
   read.

   <typescript-example id="checked-literal-config">

   ```ts
   type QueueConfig = { mode: "fifo" | "priority"; retries: number };

   const queue = {
     mode: "priority",
     retries: 3,
   } satisfies QueueConfig;
   // checked against QueueConfig; queue.mode remains "priority"
   ```

   </typescript-example>

   **Done when:** invalid callers fail at the narrowest useful boundary and
   valid callers retain helpful inference.

4. **Spend unsoundness explicitly.** Narrow before asserting. Treat `as`, `!`,
   predicates, assertion functions, ambient declarations, suppressions, and
   double assertions as claims that can lie. Isolate the smallest claim and
   attach evidence at the layer where it could be false.

   <escape-hatch>
   Claim:
   Why TypeScript cannot express the evidence:
   Smallest isolated scope:
   Static counterexample:
   Runtime falsifier:
   Removal condition:
   </escape-hatch>

   **Done when:** no external value becomes trusted only because the compiler
   was silenced.

5. **Prove at both layers only when both changed.** Run the narrowest
   repository-supported typecheck for changed TypeScript source, declarations,
   or configuration. Add compile-time proof for a public relationship that
   could silently widen; add runtime proof only for runtime behavior or values
   admitted through an unsound boundary.

   **Done when:** the static proof can reject the wrong relationship, runtime
   proof covers only runtime risk, and neither is presented as evidence for the
   other.
