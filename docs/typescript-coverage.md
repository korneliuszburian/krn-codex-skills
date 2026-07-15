# TypeScript Source Coverage

This is a decision ledger, not a study guide. It proves where the global
TypeScript standard came from, what was retained, who consumes it, and how each
claim can fail without putting course prose into model context.

## Source contract

- **Canonical private source:** *Total TypeScript — The Essentials*, final 2026
  operator copy, 545 pages, SHA-256
  `9265b55c2010d847edd3ad4d9b2429bc8e6ec40b52e159a8d4f56bcab5e900da`.
  The complete detailed contents, 16 chapters, and index were inspected.
- **Corroborating source:** `mattpocock/total-typescript-book-015` at
  `948a00e8d59c838d89a4c7fddf7acd089bd0f73d`. Its 2024 workshop topology and
  TypeScript 5.5.2 examples are incomplete relative to the final PDF, so they
  cannot define current coverage.
- **Current mechanics:** official TypeScript documentation owns compiler,
  module-resolution, declaration, and release compatibility claims.
- **Copyright boundary:** retain original mechanisms, examples, and provenance
  only. Never commit book passages, exercises, solutions, or raw extraction.

Each block implements the same contract:

<coverage-contract>
Source -> mechanisms -> conditions and traps -> KRN standard -> workflow
consumers -> original example or reference -> falsifier -> does-not-prove ->
adopted | rejected | omitted-with-reason
</coverage-contract>

## Chapter decisions

<source-decision id="tt-01">
Source: PDF chapter 1; companion `01-setup-typescript.md`.
Mechanisms: static JavaScript model, language service, compiler, runtime, and toolchain setup.
Conditions and traps: types erase; global tools may differ from the repository-pinned compiler.
KRN standard: treat typecheck, emit, and runtime as separate observers; use repository-local tooling.
Consumers: implement, diagnosing-bugs, compiler configuration.
Reference: `compiler-resolution-and-proof.md` — compiler version and proof selection.
Falsifier: typecheck passes while emitted or executed JavaScript fails.
Does not prove: static success is runtime correctness or toolchain compatibility.
Disposition: adopted; installation walkthrough omitted as operator-specific.
</source-decision>

<source-decision id="tt-02">
Source: PDF chapter 2; companion `02-ide-superpowers.md`.
Mechanisms: diagnostics, contextual inspection, declaration navigation, references, rename, imports, and JavaScript tooling.
Conditions and traps: editor gestures and displayed wording vary by IDE and compiler version.
KRN standard: retain CLI-translatable diagnosis—inspect inferred declarations, trace symbols, and use the narrow compiler loop.
Consumers: diagnosing-bugs, implement, code-review.
Reference: `inference-and-annotations.md` and `compiler-resolution-and-proof.md`.
Falsifier: the CLI or emitted declaration contradicts the inferred editor model.
Does not prove: a diagnostic identifies root cause or a refactor preserves runtime behavior.
Disposition: TypeScript diagnosis mechanisms adopted; JavaScript tooling, VS Code keystrokes, and UI walkthroughs omitted-with-reason because this companion does not own ordinary JavaScript or migration workflow.
</source-decision>

<source-decision id="tt-03">
Source: PDF chapter 3; companion `03-typescript-in-the-development-pipeline.md`.
Mechanisms: transpilation, watch feedback, CLI diagnostics, framework-owned builds, and TypeScript as a static checker.
Conditions and traps: a framework may transpile without typechecking; `tsc` may typecheck without owning emit.
KRN standard: identify the owner of typecheck, emit, bundle, and execution before selecting proof.
Consumers: implement, diagnosing-bugs, target-repo-work.
Reference: `compiler-resolution-and-proof.md` — host semantics and proof table.
Falsifier: the claimed build stage is skipped or uses a different configuration.
Does not prove: green typecheck means the bundle or application runs.
Disposition: adopted.
</source-decision>

<source-decision id="tt-04">
Source: PDF chapter 4; companion `04-essential-types-and-annotations.md` and concrete essential-type workshops.
Mechanisms: primitive and object annotations, aliases, arrays, tuples, optionals, defaults, rest parameters, function types, `void`, async returns, and `any`.
Conditions and traps: empty values lack context; `void` callback assignability differs from an explicit unusable return; `any` propagates.
KRN standard: infer implementations, annotate public inputs, model positions only while a tuple stays legible, and isolate `any` at adapters.
Consumers: implement, code-review, public API design.
Reference: `inference-and-annotations.md`, `functions-generics-and-callbacks.md`, and `runtime-boundaries-and-escape-hatches.md`.
Falsifier: invalid callers compile or a supposedly typed external value bypasses validation.
Does not prove: annotations validate runtime input.
Disposition: adopted; course exercises and solutions omitted.
</source-decision>

<source-decision id="tt-05">
Source: PDF chapter 5; companion `05-unions-literals-and-narrowing.md`.
Mechanisms: unions, literals, width, control-flow narrowing, `unknown`, `never`, discriminated unions, and exhaustive state.
Conditions and traps: truthiness loses valid falsy values; a bag of optionals permits impossible states; custom narrowing may lie.
KRN standard: validate external `unknown`, use stable discriminants, and make new states break exhaustive consumers.
Consumers: implement, diagnosing-bugs, domain and API design.
Reference: `objects-indexing-and-state.md` and `runtime-boundaries-and-escape-hatches.md`.
Original example: `exhaustive-job-state`.
Falsifier: add a union member and observe that a required consumer still compiles unchanged.
Does not prove: exhaustive static handling validates serialized data or business transitions.
Disposition: adopted.
</source-decision>

<source-decision id="tt-06">
Source: PDF chapter 6; companion `06-objects.md`.
Mechanisms: structural objects, interfaces, intersections, extension, index signatures, `Record`, `PropertyKey`, and object utility types.
Conditions and traps: objects are open; excess checks are contextual; intersection conflicts can become `never`; `Pick` and `Omit` do not distribute over unions.
KRN standard: distinguish known from dynamic keys, preserve unchecked lookup uncertainty, and choose extension that exposes conflicts.
Consumers: implement, code-review, codebase-design.
Reference: `objects-indexing-and-state.md` and `type-transformations.md`.
Original example: `checked-dynamic-lookup`.
Falsifier: an invalid key or impossible composed property still compiles.
Does not prove: a static object type seals or sanitizes a runtime object.
Disposition: adopted.
</source-decision>

<source-decision id="tt-07">
Source: PDF chapter 7; companion `07-mutability.md`.
Mechanisms: literal widening, mutable properties, readonly arrays and objects, `as const`, and runtime freeze distinction.
Conditions and traps: readonly is shallow in many contracts and never a runtime freeze; const binding does not freeze properties.
KRN standard: encode immutability only when callers depend on it; use runtime enforcement when mutation must actually fail.
Consumers: implementation and public API review.
Reference: `inference-and-annotations.md`.
Original example: `literal-source-of-truth`.
Falsifier: compile-time mutation succeeds, or runtime mutation succeeds where runtime immutability was claimed.
Does not prove: readonly data is deeply immutable or safe across external boundaries.
Disposition: adopted.
</source-decision>

<source-decision id="tt-08">
Source: PDF chapter 8; companion `08-classes.md`.
Mechanisms: class type/value duality, properties, methods, access, construction, inheritance, override, implements, and abstraction.
Conditions and traps: `implements` checks the instance surface only; access modifiers and declarations do not establish runtime invariants by themselves.
KRN standard: use a class for real construction, identity, encapsulation, or runtime prototype behavior—not as mandatory organization.
Consumers: codebase-design, implement, public API review.
Reference: `public-apis-modules-and-declarations.md`.
Falsifier: a real consumer violates the promised construction or override contract.
Does not prove: object-oriented structure is the deeper architecture.
Disposition: mechanisms adopted; class-first design rejected.
</source-decision>

<source-decision id="tt-09">
Source: PDF chapter 9; companion `09-typescript-only-features.md`.
Mechanisms: parameter properties, enums, namespaces, emitted TypeScript-only syntax, erasable alternatives, and host type-stripping boundaries.
Conditions and traps: a type-stripping host cannot execute syntax that requires transformation; emitted behavior, reverse mappings, merging, isolated transpilation, and compiler support vary by the pinned toolchain.
KRN standard: prefer unions, `as const` objects, modules, and explicit properties; permit non-erasable syntax only when a named transform owns it, and use the pinned compiler's erasable-syntax guard when the real host only strips types.
Consumers: implement, code-review, module and library design.
Reference: `public-apis-modules-and-declarations.md` and `compiler-resolution-and-proof.md` — emitted syntax and host boundary.
Original example: `erasable-host-boundary`.
Falsifier: a non-erasable fixture passes the configured guard or reaches a stripping-only host without a named transform; transformed syntax must execute through its actual build path.
Does not prove: every enum or namespace is wrong in every existing ecosystem.
Disposition: mechanisms adopted; TS-only constructs rejected as global defaults.
</source-decision>

<source-decision id="tt-10">
Source: PDF chapter 10; companion `10-deriving-types.md`.
Mechanisms: `keyof`, type-position `typeof`, indexed access, const value owners, function utilities, transformation, and derive-versus-decouple.
Conditions and traps: derivation creates ownership coupling; runtime and type-position operators differ.
KRN standard: derive within one authority, declare an explicit contract across independently evolving layers.
Consumers: implement, code-review, codebase-design.
Reference: `type-transformations.md`.
Original example: `event-map-derivation`.
Falsifier: change the alleged owner and observe whether every intended consumer moves—or an independent consumer breaks accidentally.
Does not prove: synchronized types preserve semantic or wire compatibility.
Disposition: adopted.
</source-decision>

<source-decision id="tt-11">
Source: PDF chapter 11; companion `11-annotations-and-assertions.md`.
Mechanisms: value versus variable annotation, `satisfies`, assertions, non-null claims, double assertions, TSX assertion grammar, and error directives.
Conditions and traps: assertions and suppressions override compiler evidence; angle-bracket assertions conflict with TSX grammar; directives and compiler behavior are version-sensitive.
KRN standard: use the least-privileged ladder and record evidence, scope, counterexample, and removal condition for every escape hatch.
Consumers: implement, code-review, diagnosing-bugs.
Reference: `inference-and-annotations.md` and `runtime-boundaries-and-escape-hatches.md`.
Original examples: `checked-literal-config` and `tsx-assertion-syntax`.
Falsifier: compile the assertion in the actual `.ts` or `.tsx` host, and reject any value outside the asserted contract or suppression that hides a new error.
Does not prove: compiler acceptance makes an assertion true.
Disposition: adopted with strict escape-hatch policy.
</source-decision>

<source-decision id="tt-12">
Source: PDF chapter 12; companion `12-the-weird-parts.md`.
Mechanisms: evolving `any`, excess-property limits, loose object keys, `{}`, type/value namespaces, function `this`, arrow receiver capture, and union-of-function parameter intersections.
Conditions and traps: contextual inference changes with mutation; call form controls runtime `this`; callback unions can demand an impossible shared input; runtime key sets remain wider.
KRN standard: keep these unsound edges explicit in boundary and review decisions instead of pretending TypeScript is sound.
Consumers: code-review, diagnosing-bugs, TypeScript API design.
Reference: `objects-indexing-and-state.md`, `functions-generics-and-callbacks.md` — receiver and dispatch relationships, and `runtime-boundaries-and-escape-hatches.md`.
Original example: `receiver-and-dispatch-boundary`.
Falsifier: a minimal compiler or runtime counterexample contradicts the assumed relationship.
Does not prove: one counterexample invalidates TypeScript's useful static model generally.
Disposition: adopted as trap catalog.
</source-decision>

<source-decision id="tt-13">
Source: PDF chapter 13; companion `13-modules-scripts-declaration-files.md` plus incomplete workshop plan.
Mechanisms: module versus script scope, declaration files, `declare`, global and module augmentation, uncontrolled declarations, and declaration authoring.
Conditions and traps: identical syntax can mean ambient declaration or augmentation depending on file scope; declarations emit no runtime value.
KRN standard: keep application behavior in modules, declarations at genuine external boundaries, and augmentation narrow and runtime-backed.
Consumers: implement, code-review, target package and library design.
Reference: `public-apis-modules-and-declarations.md`.
Original example: `narrow-module-augmentation`.
Falsifier: compile a real consumer and execute the matching import or augmented value.
Does not prove: a compile-only declaration matches runtime module shape.
Disposition: adopted; placeholder workshop plan is corroboration only.
</source-decision>

<source-decision id="tt-14">
Source: PDF chapter 14; companion `14-configuring-typescript.md` plus incomplete workshop plan; current official compiler and module docs.
Mechanisms: strictness, target, module, type-only imports, ESM/CommonJS, no-emit, source maps, declarations, JSX, extended configs, and project references.
Conditions and traps: options and compatibility are compiler-, host-, bundler-, and framework-version sensitive.
KRN standard: inspect the pinned toolchain, match module resolution to the real host, preserve strictness, and prove each changed build stage separately.
Consumers: implement, diagnosing-bugs, target-repo-work, codebase-design.
Reference: `compiler-resolution-and-proof.md`.
Falsifier: focused compiler trace or consumer build/run disagrees with the claimed configuration.
Does not prove: one tsconfig is portable to another runtime or framework.
Disposition: adopted only with current official verification; workshop plan alone is insufficient.
</source-decision>

<source-decision id="tt-15">
Source: PDF chapter 15; companion `15-designing-your-types.md`.
Mechanisms: generic types, multiple parameters, defaults, constraints, template literals, conditional types, mapped types, key remapping, and union behavior.
Conditions and traps: naked conditional parameters distribute; helpers can obscure callers; type precision has no runtime effect.
KRN standard: preserve one live relationship under a complexity budget and prefer explicit public types when transformation becomes harder to read.
Consumers: implementation, review, public API and codebase design.
Reference: `functions-generics-and-callbacks.md` and `type-transformations.md`.
Original examples: `distributed-payload` and `handler-key-remap`.
Falsifier: one accepted and one rejected type case at the public helper boundary.
Does not prove: a precise route, event, or payload string is valid at runtime.
Disposition: adopted; puzzle-like sophistication without a consumer rejected.
</source-decision>

<source-decision id="tt-16">
Source: PDF chapter 16; companion `16-the-utils-folder.md`.
Mechanisms: generic function inference, constraints, predicates, assertion functions, overloads, and shared utility ownership.
Conditions and traps: predicates, assertions, and overload declarations can lie; a utils folder can hide ownerless policy.
KRN standard: place a reusable function with the concept it owns, preserve a caller relationship, and runtime-test every privileged narrowing boundary.
Consumers: implement, code-review, codebase-design.
Reference: `functions-generics-and-callbacks.md` — concept-owned shared utilities, and `runtime-boundaries-and-escape-hatches.md`.
Original examples: `keyed-read-relationship`, `honest-overload`, and `unknown-ingress-parser`.
Falsifier: malformed input violates narrowing, an overload returns a different runtime shape, or a shared helper has no concept owner and deletion makes its consumers clearer.
Does not prove: reuse alone earns a generic abstraction or shared folder.
Disposition: mechanisms adopted; ownerless catch-all utilities rejected.
</source-decision>

## Index and companion audit

The index is a cross-check, not a second term-by-term standard. Its production
families are in scope only through the chapter decisions and reachable
references below.

<index-family-disposition id="chapter-derived">
Families: annotations and inference; primitives, arrays, tuples, and objects;
unions and narrowing; dynamic keys and structural typing; mutability; classes
and TS-only syntax; derivation and utilities; assertions and suppressions;
function assignability and `this`; modules, globals, declarations, and
augmentation; compiler flags, emit, resolution, JSX, and project references;
generics, conditional, mapped, and template-literal types; predicates,
assertion functions, and overloads.
Disposition: adopted only through `tt-01` to `tt-16` and their named references.
Consumer: `typescript-engineering` branch routing and its composing workflow.
Falsifier: a listed family has no chapter disposition or no reachable reference that changes a production decision.
Does not prove: every individual index entry is current, universally useful, or independently adopted.
</index-family-disposition>

<index-family-disposition id="index-only">
Families: editor gestures, installation steps, teaching artifacts, tool-specific
names, and version- or framework-sensitive entries not retained by a chapter
decision.
Disposition: omitted-with-reason from the global standard; a named production
consumer must reopen the term against a current primary source.
Consumer: none until a task names the host, framework, or tool that owns it.
Falsifier: the same term repeatedly changes production work but still has no owned current-source branch.
Does not prove: an omitted term is invalid or unimportant in every repository.
</index-family-disposition>

<framework-disposition id="react-component-typing">
Disposition: omitted-with-reason because `jsx` compiler behavior does not
establish a universal React component API standard. TypeScript-specific TSX
grammar remains adopted through `tt-11`; component APIs require a separate
current framework-source decision.
Consumer: a framework-specific implementation or review workflow.
Falsifier: a supposedly framework-specific rule is actually enforced by the core TypeScript parser or compiler.
Does not prove: React component typing is unnecessary or stable across framework versions.
</framework-disposition>

The companion's placeholder plans for modules/declarations, uncontrolled
types, compiler configuration, and style do not prove coverage; retained
mechanisms are owned by the chapter decisions and current official sources
above.

<companion-gap id="javascript-migration">
Source: companion `src/095-migrating-from-javascript/plan.md` is a placeholder;
the final PDF supplies isolated JavaScript-tooling observations, not a complete
migration standard.
Disposition: omitted-with-reason because `typescript-engineering` explicitly
does not own ordinary JavaScript or repository migration sequencing.
Consumer: none in the current global companion.
Falsifier: an approved repeated migration workflow gains a named owner, current primary sources, and a bounded production consumer.
Does not prove: JavaScript migration is unimportant or that `allowJs`, JSDoc, and staged conversion share one universal policy.
</companion-gap>
