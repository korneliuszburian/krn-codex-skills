# Inference and Annotations

Inference is compression: keep it where one implementation owns the fact, and
annotate where another human, module, or runtime must rely on the contract.

## Infer inside, annotate at boundaries

- Infer local variables, implementation returns, and callback parameters when
  context already supplies the type.
- Annotate public parameters. Annotate exported returns when inferred details
  would leak an implementation choice or create accidental API drift.
- Give empty arrays, empty objects, recursive values, and callback APIs enough
  context to avoid evolving `any`, `never[]`, or unwanted widening.
- Use a named type when the concept has an owner; do not name a one-use shape
  merely to make the file look typed.

<typescript-example id="public-result-boundary">

```ts
type LookupResult =
  | { status: "found"; value: string }
  | { status: "missing" };

export function lookup(cache: Map<string, string>, key: string): LookupResult {
  const value = cache.get(key);
  return value === undefined ? { status: "missing" } : { status: "found", value };
}
```

The explicit return prevents a later internal refactor from silently exporting
an extra state or implementation field.

</typescript-example>

## Choose annotation, `satisfies`, or `as const` deliberately

- `const value: Contract = ...` checks and exposes `Contract`; useful when the
  consumer should see that abstraction.
- `value satisfies Contract` checks compatibility while retaining useful
  literals and properties; use it for configuration and lookup tables.
- `as const` deeply narrows literal properties and marks them readonly in the
  type system. It does not freeze the runtime object.
- `let` usually widens because reassignment is possible. `const` narrows the
  binding, but mutable object properties still widen unless context prevents it.

<typescript-example id="literal-source-of-truth">

```ts
const levels = ["info", "warn", "error"] as const;
type LogLevel = (typeof levels)[number];
```

Derivation is correct while the runtime list and public type have one owner. If
the API must accept values not present in this process, declare the contract
separately.

</typescript-example>

## Keep type and value worlds distinct

Types disappear during emit. `typeof` in a type position inspects a static
value shape; runtime `typeof` returns JavaScript's limited string categories.
Classes and enums create both values and types; interfaces and type aliases do
not. Before using a name, ask whether the consumer needs a runtime value, a
static relationship, or both.

## Falsify inference decisions

- Add one invalid caller that should fail without pinning an exact diagnostic.
- Hover text and generated declarations are useful inspection evidence, not
  runtime proof.
- If a public return must stay stable, emit or inspect its declaration in a
  focused consumer fixture.
- If runtime immutability matters, exercise mutation or freeze behavior; a
  readonly type cannot prove it.
