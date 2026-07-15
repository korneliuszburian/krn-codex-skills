# Compiler, Resolution, and Proof

Compiler configuration describes a real host and build pipeline. Copying a
fashionable tsconfig without matching that host creates false confidence.

## Start from the repository-pinned compiler

Read the installed TypeScript version, package scripts, extended configs,
runtime, bundler, test runner, package exports, and declaration pipeline before
changing an option. Current upstream defaults and deprecations can differ from
the course or another repository.

TypeScript 7 is a native compiler and language-service generation with material
tooling compatibility boundaries. Do not upgrade or select it globally from
this skill. Follow the target repository and current official compatibility
guidance, especially for tools that embed the TypeScript programmatic API.

## Keep strictness and host semantics honest

- Preserve `strict` and `noUncheckedIndexedAccess` unless a named compatibility
  owner accepts the loss. Enable additional strictness based on the actual
  codebase and migration evidence.
- Use `isolatedModules` when files must be safely transpiled independently.
- Set `target` and `lib` for the runtime APIs actually available; a type
  declaration does not polyfill a runtime.
- Treat transpilation, typechecking, declaration emit, bundling, and execution
  as separate stages. `noEmit` means another tool owns JavaScript output.
- `skipLibCheck` is a dependency-performance trade-off, not evidence that local
  or third-party declarations are sound.

## Match module resolution to the host

Choose `module` and `moduleResolution` for the runtime or bundler that resolves
the emitted import. Node modes, bundler mode, package `imports`/`exports`, file
extensions, and declaration lookup interact; `paths` changes compiler lookup
and does not rewrite runtime imports by itself. Never use `classic` for modern
projects.

When resolution is unclear, run the compiler's resolution trace on the one
specifier and compare it with the runtime or bundler. A successful type lookup
does not prove the emitted JavaScript can import the same package.

## Scale with configs only when boundaries are real

Extended configs share policy. Project references can improve large-repo
checking and enforce project boundaries, but require correct composite output
and declaration ownership. Do not introduce references to simulate architecture
that packages and callers do not already have.

`jsx` is a compiler/emit choice, not a React API standard. Load framework-owned
guidance for component types, runtime transforms, and embedded language tools.

## Select the cheapest proof that can disagree

| Changed risk | Credible proof |
|---|---|
| inference or exhaustiveness | narrow typecheck; one negative type case only for a durable public relationship |
| external validator or predicate | malformed runtime value plus narrow typecheck |
| unchanged types, changed behavior | public-seam runtime proof |
| declaration or package API | real consumer compile; emitted declarations when claimed |
| module or interop | resolution trace or consumer build plus runtime import |
| tsconfig or project references | focused package compiler/build, then required workspace typecheck |
| persisted typed JSON | adapter or database round-trip plus typecheck |

Run the narrowest repository-supported typecheck during the loop. Run the root
or workspace check at completion only when no narrower command covers the
boundary or the repository contract requires it. Do not add snapshots of
diagnostic wording, declaration text, or file topology unless that exact output
is the public contract.
