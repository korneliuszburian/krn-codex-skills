# Objects, Indexing, and State

Object types describe required structure; they do not seal runtime objects.
Model known states precisely and dynamic keys honestly.

## Structural objects stay open

- A value may contain more properties than its target type. Excess-property
  checks are strongest on fresh literals and are an authoring aid, not runtime
  exactness.
- `{}` means any non-nullish value. Use `unknown` for an untrusted value,
  `object` for a non-primitive, and a named property shape for a real object
  contract.
- Prefer `interface extends` when composing object contracts whose conflicting
  properties should fail immediately. Intersections can defer an impossible
  property into `never`.
- Choose `type` for unions and transformations. Choose `interface` when public
  object extension or declaration merging is intentionally part of the API.

## Dynamic keys require a dynamic contract

- Use `Record<Key, Value>` for a closed key union and an index signature for an
  genuinely open key space.
- Keep `noUncheckedIndexedAccess` enabled so an open lookup includes
  `undefined`; narrow before use.
- `Object.keys` returns runtime strings because objects are open. Do not cast it
  to `(keyof T)[]` unless the runtime owner enforces exact keys.
- Use `PropertyKey` when an API truly accepts `string | number | symbol`; do not
  widen ordinary JSON maps beyond string keys.

<typescript-example id="checked-dynamic-lookup">

```ts
type Region = "eu" | "us";
const endpoints: Record<Region, URL> = {
  eu: new URL("https://eu.example.test"),
  us: new URL("https://us.example.test"),
};

function endpointFor(region: Region): URL {
  return endpoints[region];
}
```

If `region` comes from argv or JSON, validate it before calling this function;
the `Record` cannot close an external object or string at runtime.

</typescript-example>

## Make illegal states unrepresentable

Replace bags of correlated optionals with discriminated unions. Narrow on the
stable discriminant and use `never` where a new member must break compilation.

<typescript-example id="exhaustive-job-state">

```ts
type Job =
  | { state: "queued"; queuedAt: string }
  | { state: "running"; startedAt: string }
  | { state: "failed"; reason: string };

function label(job: Job): string {
  switch (job.state) {
    case "queued": return `queued ${job.queuedAt}`;
    case "running": return `running ${job.startedAt}`;
    case "failed": return `failed: ${job.reason}`;
    default: return job satisfies never;
  }
}
```

</typescript-example>

Use property-presence, equality, `typeof`, or `instanceof` narrowing only when
the runtime evidence really distinguishes members. Truthiness can erase valid
values such as `0` or `""`.

## Transform unions with care

`Pick` and `Omit` operate on the common shape of a union; they do not distribute
member by member. If member identity must survive, use an explicit distributive
conditional and prove both accepted and rejected shapes. Simpler named unions
are often clearer.
