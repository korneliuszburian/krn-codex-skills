# Public APIs, Modules, and Declarations

Design the runtime surface first. Types should describe the JavaScript callers
actually receive, through the same entry points they actually import.

## Keep public contracts smaller than implementation

- Export the minimum values and types consumers need. Hide internal helper
  types in implementation subfolders.
- Prefer several small package entry points to a barrel that re-exports an
  implementation tree.
- Compile a real consumer when changing a library surface; the producer's own
  typecheck can miss declaration emit, package exports, or resolution failures.
- Use classes only when runtime construction, identity, encapsulation, or
  inheritance is part of the contract. An `implements` clause does not prove
  constructor behavior or invariants.

<typescript-example id="implements-instance-surface">

```ts
interface Counter {
  count: number;
  bump(): void;
}

// `implements` checks the instance surface only. It proves nothing about
// construction, runtime invariants, or that bump() behaves as named.
class Tally implements Counter {
  count = 0;
  bump() {
    this.count += 1;
  }
}

// A plain object with impossible state satisfies the same interface.
const fake: Counter = { count: -99, bump() {} };
```

A class earns its place through construction, identity, or prototype behavior;
an interface alone enforces none of it.

</typescript-example>

## Distinguish modules from scripts

A file with a top-level import or export is a module with local scope. A script
can contribute to global scope. Prefer modules for application code and use
the repository's explicit `moduleDetection` policy rather than accidental
global behavior.

Type-only imports and exports make erasure intent clear. Their emitted behavior
still depends on the pinned compiler and build tool; inspect output when emit is
part of the claim.

## Use declarations only at declaration boundaries

- `.ts` files own executable application behavior. `.d.ts` files describe
  JavaScript or ambient values and emit no implementation.
- Match a declaration to the real library consumption shape: ESM, CommonJS,
  global, or UMD. Do not paper over a runtime mismatch with a type-only alias.
- `declare global` intentionally extends global scope. Keep it narrow and
  loaded through an explicit module.
- `declare module "x"` in a script declares an ambient module; the same syntax
  inside a module augments an existing module. Confusing them can replace or
  corrupt the visible type surface.
- Empty ambient declarations that resolve a package to `any` are a temporary
  escape hatch, not a typed integration.

<typescript-example id="narrow-module-augmentation">

```ts
import "request-context";

declare module "request-context" {
  interface Context {
    traceId: string;
  }
}
```

This is valid only when the runtime library really supplies `traceId` under the
same loading conditions. A compile-only augmentation cannot create the value.

</typescript-example>

## Prove the consumer contract

For public API, declaration, augmentation, or package-output changes, use a
small consumer fixture that imports the published entry point with the real
module settings. Check one valid use, one invalid use, declaration emit when
claimed, and runtime import/build when interop changed. This proves the sampled
surface—not semver safety for every consumer.
