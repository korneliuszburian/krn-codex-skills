import assert from "node:assert/strict";
import test from "node:test";

import {
  binErrors,
  pretoolUseHookErrors,
  retirementErrors,
  validateManifestSkills,
} from "../scripts/lib/manifest-rules.mjs";

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

test("binErrors validates bins with an injected target inspector", () => {
  const isSafeRelativePath = (value) => typeof value === "string" && !value.startsWith("/");
  const valid = { isSafeRelativePath, inspectTarget: () => ({ exists: true, isFile: true, executable: true }) };
  assert.deepEqual(binErrors([{ name: "krn", path: "bin/krn" }], valid).errors, []);
  assert.deepEqual(binErrors("nope", valid).errors, ["manifest: bins must be an array"]);
  assert.deepEqual(binErrors([null], valid).errors, ["manifest: bins entries must be objects"]);
  assert.deepEqual(
    binErrors([{ name: "Bad", path: "bin/krn" }], valid).errors,
    ["manifest: invalid bin name Bad"],
  );
  assert.deepEqual(
    binErrors([{ name: "krn", path: "bin/krn" }, { name: "krn", path: "bin/krn" }], valid).errors,
    ["manifest: duplicate bin name krn"],
  );

  let inspected = 0;
  const tracked = { isSafeRelativePath, inspectTarget: () => (inspected += 1, { exists: true, isFile: true, executable: true }) };
  assert.deepEqual(binErrors([{ name: "krn", path: "/abs" }], tracked).errors, [
    "manifest: unsafe bin path for krn",
  ]);
  assert.equal(inspected, 0);

  assert.deepEqual(
    binErrors([{ name: "krn", path: "bin/krn" }], {
      isSafeRelativePath,
      inspectTarget: () => ({ exists: false, isFile: false, executable: false }),
    }).errors,
    ["manifest: missing bin target for krn"],
  );
  assert.deepEqual(
    binErrors([{ name: "krn", path: "bin/krn" }], {
      isSafeRelativePath,
      inspectTarget: () => ({ exists: true, isFile: true, executable: false }),
    }).errors,
    ["manifest: bin target is not executable for krn"],
  );
});

test("pretoolUseHookErrors accepts the canonical hook and rejects drift", () => {
  const valid = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^(Bash|apply_patch)$",
          hooks: [{ type: "command", command: "python3 /hooks/krn_pretooluse.py" }],
        },
      ],
    },
  };
  assert.deepEqual(pretoolUseHookErrors(valid, "hooks.json"), []);
  assert.deepEqual(pretoolUseHookErrors({}, "hooks.json"), [
    "hooks.json: expected one PreToolUse matcher group",
  ]);
  assert.deepEqual(
    pretoolUseHookErrors(
      { hooks: { PreToolUse: [{ matcher: ".*", hooks: [] }] } },
      "hooks.json",
    ),
    ["hooks.json: expected one exact command and edit hook"],
  );
  assert.deepEqual(
    pretoolUseHookErrors(
      {
        hooks: {
          PreToolUse: [
            { matcher: ".*", hooks: [{ type: "command", command: "python3 /hooks/krn_pretooluse.py" }] },
          ],
        },
      },
      "hooks.json",
    ),
    ["hooks.json: expected one exact command and edit hook"],
  );
  assert.deepEqual(
    pretoolUseHookErrors(
      { hooks: { PreToolUse: [{ matcher: "^(Bash|apply_patch)$", hooks: [{ type: "command", command: "echo" }] }] } },
      "hooks.json",
    ),
    ["hooks.json: invalid global PreToolUse handler"],
  );
});

test("retirementErrors validates retired skill metadata", () => {
  const local = new Set(["current"]);
  const base = { name: "old", owner: "me", replacement: "current" };
  assert.deepEqual(retirementErrors([base], local), { errors: [], names: new Set(["old"]) });
  assert.deepEqual(retirementErrors([{ ...base, replacement: null }], local).errors, []);
  const cases = [
    [(doc) => (doc.replacement = "ghost"), /has unknown replacement ghost/],
    [(doc) => (doc.owner = ""), /must declare an owner/],
    [(doc) => (doc.replacement = "old"), /cannot replace itself/],
    [(doc) => (doc.name = "Bad"), /invalid retired skill name/],
    [(doc) => (doc.extra = true), /must contain only name, owner, and replacement/],
  ];
  for (const [mutate, pattern] of cases) {
    const retired = { ...base };
    mutate(retired);
    const { errors } = retirementErrors([retired], local);
    assert.ok(errors.some((message) => pattern.test(message)), `${pattern} not in ${errors}`);
  }
  assert.deepEqual(
    retirementErrors([{ ...base, name: "current", replacement: null }], local).errors,
    ["manifest: retired skill current is still active"],
  );
  assert.deepEqual(retirementErrors([base, base], local).errors, [
    "manifest: duplicate retired skill name old",
  ]);
  assert.deepEqual(retirementErrors(undefined, local).errors, [
    "manifest: retired_skills must be an array",
  ]);
});
