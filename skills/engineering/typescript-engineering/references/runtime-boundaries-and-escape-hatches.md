# Runtime Boundaries and Escape Hatches

Static types begin only after runtime evidence. External data stays `unknown`
until one ingress owner validates and constructs the domain value.

## Validate once at ingress

Treat JSON, fetch results, files, argv, environment, connectors, database JSON,
plugin messages, and user configuration as `unknown`. Validate required shape,
semantic constraints, and cross-field state before returning a trusted type.

`JSON.parse` is the canonical ingress of `any`: it is not generic (a type
argument is rejected), it returns `any`, and annotating its result is type faith,
not validation. Route its output through one ingress validator before trusting
the shape.

<typescript-example id="unknown-ingress-parser">

```ts
type RetryPolicy = { attempts: number };

function parseRetryPolicy(value: unknown): RetryPolicy {
  if (
    typeof value !== "object" ||
    value === null ||
    !("attempts" in value) ||
    typeof value.attempts !== "number" ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 0
  ) {
    throw new Error("invalid retry policy");
  }
  return { attempts: value.attempts };
}
```

Typecheck proves the parser returns the declared shape. A malformed-input test
proves the implementation rejects that runtime counterexample; neither proves
all semantic policy unless those cases are specified.

</typescript-example>

## Use the least-privileged escape hatch

When TypeScript rejects a pattern:

1. Refactor into a shape control-flow analysis understands.
2. Add an annotation when widening is intentional.
3. Use `satisfies` to check a value without discarding useful inference.
4. Narrow with runtime evidence.
5. Use `as` or `!` only for evidence the program owns but the compiler cannot
   express, and state that evidence beside the claim.

A double assertion through `unknown` bypasses overlap checking and carries the
same trust cost as `any`. Keep unavoidable `any` at an adapter boundary and
prevent it from flowing into domain code.

## Keep TSX assertion syntax unambiguous

In `.tsx`, an angle-bracket assertion conflicts with JSX grammar. Use `as` only
after the same owned evidence required in `.ts`; changing syntax does not make
the claim safer.

<typescript-example id="tsx-assertion-syntax">

```tsx
declare const value: unknown;
const claimed = value as { id: string }; // parses in TSX; still unvalidated
```

</typescript-example>

Falsify syntax with the pinned compiler in a `.tsx` fixture. If the value is
external, malformed runtime input must still reject the asserted shape.

## Suppress only intentional compiler failures

- `@ts-expect-error` is acceptable for an intentionally illegal public use or
  a pinned upstream compiler/library gap. Include a short reason and ensure the
  directive becomes unused when the error disappears.
- Do not use `@ts-ignore` or `@ts-nocheck` as a completion shortcut.
- Version-specific suppression and assertion behavior can change. Verify it
  with the repository-pinned compiler before adding policy.

## Audit every lie

Search changed code for `as`, non-null assertions, custom predicates,
assertion functions, ambient declarations, suppressions, and explicit `any`.
For each, name the evidence, smallest scope, counterexample, and removal
condition. An assertion over a trusted DOM lookup may need a focused ownership
check; an assertion over network data needs runtime validation instead.
