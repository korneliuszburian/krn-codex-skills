import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

const loadFalsifier = async () => {
  try {
    return await import("../../scripts/lib/audit/falsifier-mutate.mjs");
  } catch {
    return null;
  }
};

const MODULE = "export function add(a, b) {\n  return a + b;\n}\n";

const CHECK = (oracle) =>
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { add } from "./math.mjs";',
    'test("adds", () => {',
    oracle ? "  assert.equal(add(2, 3), 5);" : "",
    "});",
    "",
  ]
    .join("\n")
    .replace(/\n\n+/g, "\n");

const fixture = (oracle) => {
  const root = mkdtempSync(join(tmpdir(), "krn-falsifier-fixture-"));
  writeFileSync(join(root, "math.mjs"), MODULE);
  writeFileSync(join(root, "check.test.mjs"), CHECK(oracle));
  return root;
};

const check = (root) => [process.execPath, "--test", "check.test.mjs"];

test("the falsifier mutator loads and exposes a capped generator", async () => {
  const falsifier = await loadFalsifier();
  assert.ok(falsifier, "scripts/lib/audit/falsifier-mutate.mjs must exist");
  assert.equal(typeof falsifier.runFalsifierMutate, "function");
  assert.equal(typeof falsifier.generateMutants, "function");
  const mutants = falsifier.generateMutants("const a = true;\nif (a === true) return a + 1;\nreturn a;\n", 3);
  assert.ok(mutants.length <= 3, `expected at most 3 mutants, got ${mutants.length}`);
  assert.ok(mutants.length > 0, "expected the operators to produce mutants");
});

test("a deciding check that kills a mutant is falsifier-strong", async () => {
  const falsifier = await loadFalsifier();
  assert.ok(falsifier, "scripts/lib/audit/falsifier-mutate.mjs must exist");
  const root = fixture(true);
  try {
    const report = falsifier.runFalsifierMutate({ root, target: "math.mjs", command: check(root) });
    assert.ok(report.mutants.length > 0, "the mutator must generate mutants");
    assert.ok(report.killed > 0, `expected a killed mutant: ${JSON.stringify(report)}`);
    assert.equal(report.weak, false);
    assert.equal(report.phrase, "falsifier-strong");
    assert.equal(report.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removing the oracle makes the check falsifier-weak until it is restored", async () => {
  const falsifier = await loadFalsifier();
  assert.ok(falsifier, "scripts/lib/audit/falsifier-mutate.mjs must exist");
  const root = fixture(true);
  try {
    writeFileSync(join(root, "check.test.mjs"), CHECK(false));
    const hollow = falsifier.runFalsifierMutate({ root, target: "math.mjs", command: check(root) });
    assert.equal(hollow.killed, 0, `expected no kill without an oracle: ${JSON.stringify(hollow)}`);
    assert.equal(hollow.weak, true);
    assert.equal(hollow.phrase, "falsifier-weak");
    assert.notEqual(hollow.status, 0);

    writeFileSync(join(root, "check.test.mjs"), CHECK(true));
    const restored = falsifier.runFalsifierMutate({ root, target: "math.mjs", command: check(root) });
    assert.ok(restored.killed > 0, `expected the restored oracle to kill: ${JSON.stringify(restored)}`);
    assert.equal(restored.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
