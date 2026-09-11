import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runtimeClosureErrors } from "../scripts/lib/runtime-closure.mjs";

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

test("a declared but unreachable module is reported as dead weight", () => {
  const { root, manifest } = makeRepo(["scripts/a.mjs", "scripts/lib/b.mjs", "scripts/lib/dead.mjs"]);
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), [
    "declared runtime path is unreachable from installed entrypoints: scripts/lib/dead.mjs",
  ]);
  rmSync(root, { recursive: true, force: true });
});
