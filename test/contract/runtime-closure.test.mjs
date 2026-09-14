import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runtimeClosureErrors } from "../../scripts/lib/contract/runtime-closure.mjs";

const makeRepo = (runtimePaths) => {
  const root = mkdtempSync(join(tmpdir(), "krn-closure-"));
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  writeFileSync(join(root, "scripts", "a.mjs"), 'import { b } from "./lib/b.mjs";\nexport const a = b;\n');
  writeFileSync(join(root, "scripts", "lib", "b.mjs"), "export const b = 1;\n");
  const manifest = { bins: [{ path: "scripts/a.mjs" }], runtime_paths: runtimePaths };
  return { root, manifest };
};

test("a complete runtime closure reports no errors", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs"]);
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
  rmSync(root, { recursive: true, force: true });
});

test("an imported file missing from runtime_paths is a closure gap", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs"]);
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), [
    "runtime closure gap: scripts/lib/b.mjs is reachable from installed entrypoints but not declared",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("delegated and spawned scripts are part of the closure", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-closure-delegate-"));
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  writeFileSync(join(root, "scripts", "a.mjs"), 'delegate("scripts/lib/c.mjs");\n');
  writeFileSync(join(root, "scripts", "b.mjs"), 'spawnSync("node", ["scripts/lib/d.mjs"]);\n');
  writeFileSync(join(root, "scripts", "lib", "c.mjs"), "export const c = 1;\n");
  writeFileSync(join(root, "scripts", "lib", "d.mjs"), "export const d = 1;\n");
  const manifest = { bins: [{ path: "scripts/a.mjs" }, { path: "scripts/b.mjs" }], runtime_paths: ["scripts/a.mjs", "scripts/b.mjs"] };
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), [
    "runtime closure gap: scripts/lib/c.mjs is reachable from installed entrypoints but not declared",
    "runtime closure gap: scripts/lib/d.mjs is reachable from installed entrypoints but not declared",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("a declared but unreachable module is reported as dead weight", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs", "scripts/lib/dead.mjs"]);
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), [
    "declared runtime path is unreachable from installed entrypoints: scripts/lib/dead.mjs",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("a commented-out import does not make a declared path reachable", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs", "scripts/lib/dead.mjs"]);
  writeFileSync(join(root, "scripts", "a.mjs"), 'import "./lib/b.mjs";\n// import "./lib/dead.mjs"\n');
  assert.ok(runtimeClosureErrors({ root, manifest }).some((error) => error.includes("scripts/lib/dead.mjs")), JSON.stringify(runtimeClosureErrors({ root, manifest })));
  rmSync(root, { recursive: true, force: true });
});

test("a template-literal mention does not mark a declared path reachable", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs", "scripts/lib/dead.mjs"]);
  writeFileSync(join(root, "scripts", "a.mjs"), 'import "./lib/b.mjs";\nconst hint = `import "./lib/dead.mjs"`;\nexport const h = hint;\n');
  assert.ok(runtimeClosureErrors({ root, manifest }).some((error) => error.includes("scripts/lib/dead.mjs")), JSON.stringify(runtimeClosureErrors({ root, manifest })));
  rmSync(root, { recursive: true, force: true });
});

test("a string-literal mention does not make a declared path reachable", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs", "scripts/lib/dead.mjs"]);
  writeFileSync(join(root, "scripts", "lib", "dead.mjs"), "export const dead = 1;\n");
  writeFileSync(join(root, "scripts", "a.mjs"), 'import "./lib/b.mjs";\nconst hint = \'import "./lib/dead.mjs"\';\nexport const h = hint;\n');
  assert.ok(runtimeClosureErrors({ root, manifest }).some((error) => error.includes("scripts/lib/dead.mjs")), JSON.stringify(runtimeClosureErrors({ root, manifest })));
  rmSync(root, { recursive: true, force: true });
});

test("a // inside a string literal does not erase a following import", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs"]);
  writeFileSync(join(root, "scripts", "a.mjs"), 'const u = "a//b";\nimport "./lib/b.mjs";\nexport const a = u;\n');
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
  rmSync(root, { recursive: true, force: true });
});

test("a regex literal containing // does not erase a following import", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs"]);
  writeFileSync(join(root, "scripts", "a.mjs"), 'const r = /[//]/;\nimport "./lib/b.mjs";\nexport const a = r;\n');
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
  rmSync(root, { recursive: true, force: true });
});

test("a concatenated dynamic-import prefix is not a missing module", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs"]);
  writeFileSync(join(root, "scripts", "a.mjs"), 'const name = "b";\nexport const m = await import("./lib/" + name + ".mjs");\n');
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
  rmSync(root, { recursive: true, force: true });
});

test("an identifier ending in from is not treated as an import", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs"]);
  writeFileSync(join(root, "scripts", "lib", "b.mjs"), 'export const b = 1;\nreadFrom("./missing.mjs");\n');
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
  rmSync(root, { recursive: true, force: true });
});
