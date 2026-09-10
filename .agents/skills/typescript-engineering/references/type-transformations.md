# Type Transformations

Transform types to preserve one owned relationship, not to build a second
language inside TypeScript.

## Derive from the real owner

- Use `typeof` when a runtime value owns the contract.
- Use `keyof` for the keys of a static object type and indexed access for the
  value behind a selected key.
- Use `Parameters`, `ReturnType`, and `Awaited` when another function owns the
  relevant signature.
- Decouple with an explicit type when producer and consumer version, deploy, or
  evolve independently. Derivation across an authority boundary creates hidden
  coupling.

<typescript-example id="event-map-derivation">

```ts
const eventCode = {
  opened: 10,
  closed: 20,
} as const;

type EventName = keyof typeof eventCode;
type EventCode = (typeof eventCode)[EventName];
```

</typescript-example>

## Understand distribution before using conditionals

`T extends U ? X : Y` distributes when `T` is a naked type parameter. Wrap
both sides in tuples to treat a union as one value. Use `infer` only to extract
a relationship already present in the matched type.

<typescript-example id="distributed-payload">

```ts
type PayloadOf<T> = T extends { payload: infer Payload } ? Payload : never;

type Payload = PayloadOf<
  | { kind: "text"; payload: string }
  | { kind: "count"; payload: number }
>; // string | number
```

</typescript-example>

## Map keys without erasing member identity

Mapped types iterate over a known key set. Modifiers can add or remove
`readonly` and optionality; an `as` clause can remap or filter keys. When the
input is a union, decide whether you need common keys or distribution across
members before reaching for `Pick`, `Omit`, or a custom helper.

Template-literal types are useful when runtime strings already follow a closed
grammar, such as event names or route parameters. They do not validate an
arbitrary string at runtime.

<typescript-example id="handler-key-remap">

```ts
type Handlers<State> = {
  [Key in keyof State as `on${Capitalize<string & Key>}`]:
    (value: State[Key]) => void;
};
```

</typescript-example>

## Keep a complexity budget

Prefer a named union, a small overload set, or two explicit public types when a
conditional helper needs several mental reductions. Test a reusable public
transformation with one accepted and one intentionally rejected compile case.
Delete a helper when its only consumer becomes clearer without it.
