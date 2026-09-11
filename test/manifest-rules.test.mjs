import assert from "node:assert/strict";
import test from "node:test";

import { validateManifestSkills } from "../scripts/lib/manifest-rules.mjs";

const base = () => ({
  skills: [{ implicit: true, name: "alpha", path: "skills/engineering/alpha" }],
  source_only_skills: [],
  harness_skills: ["alpha"],
  runtime_paths: ["scripts/krn-codex.mjs"],
});

test("validateManifestSkills accepts a canonical manifest", () => {
  const result = validateManifestSkills(base());
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.names], ["alpha"]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].name, "alpha");
});

test("validateManifestSkills reports skill metadata violations", () => {
  const cases = [
    [(doc) => (doc.skills = "nope"), /skills must be an array/],
    [(doc) => (doc.skills = [null]), /skill metadata must be an object/],
    [(doc) => (doc.skills[0].extra = true), /must contain only implicit, name, and path/],
    [(doc) => (doc.skills[0].name = "Bad Name"), /invalid skill name/],
    [(doc) => doc.skills.push({ ...doc.skills[0], path: "skills/engineering/beta" }), /duplicate skill name/],
    [(doc) => (doc.skills[0].path = "/abs"), /unsafe path for alpha/],
    [(doc) => doc.skills.push({ implicit: true, name: "beta", path: "skills/engineering/alpha" }), /duplicate skill path/],
    [(doc) => (doc.skills[0].implicit = "yes"), /implicit must be boolean/],
    [(doc) => (doc.skills[0].path = "skills/other/alpha"), /skill path must be skills\/<group>\/alpha/],
  ];
  for (const [mutate, pattern] of cases) {
    const document = base();
    mutate(document);
    const { errors } = validateManifestSkills(document);
    assert.ok(
      errors.some((message) => pattern.test(message)),
      `expected ${pattern} in ${JSON.stringify(errors)}`,
    );
  }
});

test("validateManifestSkills checks harness and runtime invariants", () => {
  const unknownHarness = base();
  unknownHarness.harness_skills = ["missing"];
  assert.ok(
    validateManifestSkills(unknownHarness).errors.includes(
      "manifest: harness skill missing is not a local installable skill",
    ),
  );

  const emptyHarness = base();
  emptyHarness.harness_skills = [];
  assert.ok(
    validateManifestSkills(emptyHarness).errors.includes(
      "manifest: harness_skills must be a non-empty array",
    ),
  );

  const badRuntime = base();
  badRuntime.runtime_paths = ["../escape"];
  assert.ok(
    validateManifestSkills(badRuntime).errors.includes("manifest: unsafe runtime path ../escape"),
  );

  const noRuntime = base();
  delete noRuntime.runtime_paths;
  assert.ok(
    validateManifestSkills(noRuntime).errors.includes(
      "manifest: runtime_paths must be a non-empty array",
    ),
  );
});
