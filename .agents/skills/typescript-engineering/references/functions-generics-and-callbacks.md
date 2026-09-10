# Functions, Generics, and Callbacks

A function type should preserve one caller-visible relationship. Extra type
parameters and overloads are debt unless they improve that relationship.

## Shape ordinary signatures plainly

- Annotate public parameters; infer local callback parameters from context.
- Optional parameters model meaningful omission; defaults also supply values.
- Use tuples for fixed positions/rest tails; use objects when positions blur.
- A callback may return into `() => void` when ignored; explicit `void` exposes no value.
- Preserve `strictFunctionTypes`; fix caller ownership instead of widening callbacks.

## Preserve receiver and dispatch relationships

A `this` declaration checks callers but erases; call form supplies the receiver.
Arrows capture lexical receivers. Assignment may typecheck, but they cannot
provide caller-supplied dynamic-`this` semantics.

A union of function types is not a dispatcher: its input must satisfy every
member, often collapsing to an impossible intersection. Preserve correlation
with a keyed map, generic, discriminated tuple, or honest overload instead.

<typescript-example id="receiver-and-dispatch-boundary">

```ts
type Events = { click: { x: number }; key: { key: string } };
type Listeners = {
  [Key in keyof Events]: (this: { id: string }, event: Events[Key]) => void;
};
declare const listeners: Listeners, receiver: { id: string };
type Ambiguous = Listeners[keyof Listeners]; // requires every member's input
function on<Key extends keyof Events>(key: Key): Listeners[Key] {
  return listeners[key];
}
const click = on("click");
click.call(receiver, { x: 1 });
// @ts-expect-error the selected key rejects another payload
click.call(receiver, { key: "Enter" });
```

</typescript-example>

Falsify one wrong key/payload pair at compile time and invoke a valid listener
with the real receiver. Static acceptance does not prove the runtime call form.

## Add a generic only for a live relationship

Connect each type parameter to two positions or one constrained return. Infer
from inputs; use the narrowest constraint and default only for clear omission.

<typescript-example id="keyed-read-relationship">

```ts
function readField<Shape, Key extends keyof Shape>(
  value: Shape,
  key: Key,
): Shape[Key] {
  return value[key];
}
```

This preserves the selected key-to-value relationship. `identity<T>(value: T)`
can be valid; a type parameter used once usually wants a concrete type.

</typescript-example>

## Prefer unions, then overloads, then conditional signatures

Use a union for one shared result. Overload only for meaningfully distinct call
shapes whose combined input the implementation handles honestly. Keep its broad
signature invisible to callers.

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

`value is T` and `asserts value is T` create authority the compiler cannot
verify. Keep them beside the check, accept `unknown`, and prove malformed values;
return a parsed domain value when validation also normalizes.

## Put shared utilities with their concept

Place a generic beside the concept it preserves. Share only domain-neutral
policy with multiple consumers; `utils` is a location, not an owner. Name owner
and callers, then delete it: clearer consumers mean the helper was not earned.
