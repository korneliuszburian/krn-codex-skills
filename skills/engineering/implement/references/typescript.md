# TypeScript Engineering

TypeScript models JavaScript; its types disappear at runtime. Use typecheck for
relationships and runtime proof for incoming data and behavior.

## Boundary Procedure

1. Classify the boundary: public interface, external input, internal domain,
   persistence, CLI, connector, fixture, declaration, or compiler config.
2. Infer locals and implementation returns when the result is clear. Annotate
   public parameters and contracts callers must understand. Annotate exported
   returns when inference would expose implementation detail.
3. Receive JSON, fetch results, files, environment, argv, connector output, and
   user configuration as `unknown`. Validate once at ingress, then construct a
   domain value or discriminated result.
4. Model mutually exclusive runtime states with a discriminated union instead
   of co-located optionals. Use exhaustive narrowing where a missing state must
   fail compilation.
5. Derive with `typeof`, `keyof`, indexed access, `Parameters`,
   `ReturnType`, or `Awaited` when value and type share one owner. Declare an
   explicit consumer type when layers evolve independently.
6. Prefer `satisfies` when checking a value while preserving useful literal
   inference. Prefer narrowing to assertions.
7. Treat `as`, `!`, type predicates, assertion functions, ambient
   declarations, and suppressions as privileged claims that can lie. Isolate
   them and falsify any external value they admit.
8. Use `readonly` parameters and `as const` configuration when immutability
   or literal inference is part of the contract. Type-level readonly is not
   runtime freezing, and readonly object properties are not a sound mutation
   barrier.
9. Add a generic only when one current relationship must survive across inputs
   and outputs. Prefer inference and narrow constraints. Use a named union or
   overload when advanced conditional or mapped machinery obscures the caller.
10. Keep application types in `.ts` modules with explicit imports. Use
    `.d.ts`, augmentation, or globals only for a genuine ambient or external
    boundary.

## Decision Ladder

When TypeScript rejects a pattern:

1. refactor into a shape the compiler can understand;
2. add a boundary annotation when widening is intended;
3. use `satisfies` to check while preserving inference;
4. use `as` or `!` only when the program owns evidence the compiler cannot
   express, and state that evidence locally.

A double assertion through `unknown` bypasses the compiler's overlap guard and
has the same trust cost as `any`.

## State And Object Traps

- Object types are open. Excess-property checks are strongest on fresh object
  literals and do not make runtime objects closed.
- `{}` means any non-nullish value, not an empty object.
- `Object.keys` returns runtime strings. Validate or deliberately widen when
  correctness depends on a closed key set.
- `Pick` and `Omit` do not distribute across unions by default.
- `let` widens; `const` narrows the binding; object properties still widen
  unless constrained or declared `as const`.
- Prefer erasable JavaScript-compatible constructs. Use unions or `as const`
  objects instead of introducing enums, namespaces, or parameter properties
  without an external contract.

## Compiler Boundary

Keep strictness intact, especially `strict`, `noUncheckedIndexedAccess`,
`isolatedModules`, and explicit module detection. Treat transpilation and
typechecking as separate operations. `skipLibCheck` is a dependency
performance trade-off, not proof that local declarations are sound.

Match module settings to the real runtime or bundler. A tsconfig change needs a
focused compiler or package-build proof in addition to the root typecheck.

## Proof Selector

| Changed risk | Cheapest credible proof |
|---|---|
| inference, relationship, exhaustiveness | typecheck; one compile-time assertion only for a public contract that could silently widen |
| external validator or predicate | one malformed-input runtime case plus typecheck |
| runtime behavior behind unchanged types | public-seam behavior proof |
| already-covered type refactor | existing proof before and after plus typecheck |
| module, declaration, or tsconfig | focused compiler fixture or package build plus root typecheck |
| persisted JSON | adapter or database round-trip plus typecheck |

Use `@ts-expect-error` only for an intentionally illegal public use or a named
upstream gap. Do not use `@ts-ignore` or `@ts-nocheck` as a completion
shortcut.
