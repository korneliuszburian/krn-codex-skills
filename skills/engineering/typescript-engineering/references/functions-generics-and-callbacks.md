# Functions, Generics, and Callbacks

A function type should preserve one caller-visible relationship. Extra type
parameters and overloads are debt unless they improve that relationship.

## Shape ordinary signatures plainly

- Annotate public parameters; infer local callback parameters from context.
- Use optional parameters only when omission is meaningful. A default value
  also makes a parameter optional to callers but supplies a runtime value.
- Model fixed positional data with tuples and variable tails with rest tuples;
  prefer an object once positions lose obvious meaning.
- A callback returning a value is assignable to a `() => void` slot because the
  caller promises to ignore the result. A function explicitly declared to
  return `void` does not provide a usable value.
- Keep `strictFunctionTypes` behavior intact. Do not widen callback parameters
  to silence a variance error; fix who may call the function with which value.

## Add a generic only for a live relationship

Every type parameter should appear in at least two useful positions or
constrain one returned structure. Infer it from inputs when possible. Use the
narrowest constraint required by the implementation and a default only when
omitting the argument has one unambiguous meaning.

<typescript-example id="keyed-read-relationship">

```ts
function readField<Shape, Key extends keyof Shape>(
  value: Shape,
  key: Key,
): Shape[Key] {
  return value[key];
}
```

This generic preserves the selected key-to-value relationship. A generic
`identity<T>(value: T): T` may also be valid; a type parameter used only once
usually wants a concrete type instead.

</typescript-example>

## Prefer unions, then overloads, then conditional signatures

Use a union when callers receive one shared result. Use overloads when distinct
call shapes produce meaningfully distinct results and the implementation can
honestly handle their combined input. Keep the implementation signature broad
enough for every overload but invisible to callers.

<typescript-example id="honest-overload">

```ts
function parseCount(value: string): number;
function parseCount(value: number): number;
function parseCount(value: string | number): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10);
}
```

An overload declaration can lie about runtime output. Exercise each public
branch when behavior differs.

</typescript-example>

## Predicates and assertion functions are privileged

`value is T` and `asserts value is T` make the implementation an authority the
compiler cannot verify. Keep them beside the runtime check, accept `unknown`,
and include malformed values in runtime proof. Prefer a function returning a
parsed domain value when validation also normalizes data.

Classes occupy both type and value space. Use them when construction,
encapsulation, identity, or runtime `instanceof` is part of the domain—not as a
default wrapper around functions. `implements` checks the instance surface; it
does not validate static members or runtime invariants.
