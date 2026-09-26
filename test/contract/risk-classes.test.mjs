import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = join(root, "scripts", "lib", "contract", "risk-classes.mjs");

async function loadRiskClasses() {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch {
    return null;
  }
}

const manifest = (runtimePaths) => ({ schema_version: 1, runtime_paths: runtimePaths });
const registry = (entries) => ({ schema_version: 1, entries });

const authorityFor = (riskClass) =>
  `Authority: the ${riskClass} row is exercised by an explicit observer request.`;

test("the seeded registry covers every runtime path with a known class", async () => {
  const risk = await loadRiskClasses();
  assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
  const document = risk.loadRuntimeRisks(root);
  assert.ok(document, "config/runtime-risks.json must exist");
  const manifestJson = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8"));
  assert.deepEqual(risk.riskClassErrors({ manifest: manifestJson, registry: document }), []);
  const covered = new Set(document.entries.map((entry) => entry.path));
  for (const path of manifestJson.runtime_paths) {
    assert.ok(covered.has(path), `${path} must have a seeded risk class`);
  }
  const classes = new Set(document.entries.map((entry) => entry.class));
  for (const value of ["read-only", "additive", "destructive"]) {
    assert.ok(classes.has(value), `the seed must exercise the ${value} class`);
  }
});

test("a runtime path with no row is undeclared-risk", async () => {
  const risk = await loadRiskClasses();
  assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
  const errors = risk.riskClassErrors({
    manifest: manifest(["scripts/a.mjs"]),
    registry: registry([]),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /undeclared-risk/);
  assert.match(errors[0], /scripts\/a\.mjs/);
});

test("a row without a class is undeclared-risk", async () => {
  const risk = await loadRiskClasses();
  assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
  const errors = risk.riskClassErrors({
    manifest: manifest(["scripts/a.mjs"]),
    registry: registry([{ path: "scripts/a.mjs" }]),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /undeclared-risk/);
});

test("an unknown class is undeclared-risk", async () => {
  const risk = await loadRiskClasses();
  assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
  const errors = risk.riskClassErrors({
    manifest: manifest(["scripts/a.mjs"]),
    registry: registry([{ path: "scripts/a.mjs", class: "banana" }]),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /undeclared-risk/);
  assert.match(errors[0], /banana/);
});

test("a missing registry is undeclared-risk", async () => {
  const risk = await loadRiskClasses();
  assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
  const errors = risk.riskClassErrors({
    manifest: manifest(["scripts/a.mjs"]),
    registry: null,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /undeclared-risk/);
});

for (const riskClass of ["read-only", "additive"]) {
  test(`a ${riskClass} row needs no authority note`, async () => {
    const risk = await loadRiskClasses();
    assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
    assert.deepEqual(
      risk.riskClassErrors({
        manifest: manifest(["scripts/a.mjs"]),
        registry: registry([{ path: "scripts/a.mjs", class: riskClass }]),
      }),
      [],
    );
  });
}

for (const riskClass of ["destructive", "external"]) {
  test(`a ${riskClass} row without an authority note is undeclared-risk`, async () => {
    const risk = await loadRiskClasses();
    assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
    const errors = risk.riskClassErrors({
      manifest: manifest(["scripts/a.mjs"]),
      registry: registry([{ path: "scripts/a.mjs", class: riskClass }]),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /undeclared-risk/);
  });

  test(`a ${riskClass} row with an authority note is clean`, async () => {
    const risk = await loadRiskClasses();
    assert.ok(risk, "scripts/lib/contract/risk-classes.mjs must load");
    assert.deepEqual(
      risk.riskClassErrors({
        manifest: manifest(["scripts/a.mjs"]),
        registry: registry([
          { path: "scripts/a.mjs", class: riskClass, authority: authorityFor(riskClass) },
        ]),
      }),
      [],
    );
  });
}
