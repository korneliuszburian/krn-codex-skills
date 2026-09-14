import assert from "node:assert/strict";
import test from "node:test";

import { isSafeRelativePath } from "../../scripts/lib/support/path-rules.mjs";

import {
  binErrors,
  hookFileErrors,
  legacyHookPathErrors,
  pretoolUseHookErrors,
  retirementErrors,
  validateManifestSkills,
} from "../../scripts/lib/contract/manifest-rules.mjs";

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

  const sourceOnlyHarness = base();
  sourceOnlyHarness.source_only_skills = [{ implicit: true, name: "beta", path: "skills/engineering/beta" }];
  sourceOnlyHarness.harness_skills = ["beta"];
  assert.ok(
    validateManifestSkills(sourceOnlyHarness).errors.includes(
      "manifest: harness skill beta is not a local installable skill",
    ),
    JSON.stringify(validateManifestSkills(sourceOnlyHarness).errors),
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

test("hookFileErrors validates hook files with an injected inspector", () => {
  const isSafeRelativePath = (value) => typeof value === "string" && !value.startsWith("/");
  const ok = { isSafeRelativePath, inspectTarget: () => ({ exists: true, isFile: true, executable: false }) };
  assert.deepEqual(hookFileErrors([{ name: "hook.py", path: "hooks/hook.py", executable: false }], ok).errors, []);
  assert.deepEqual(hookFileErrors("nope", ok).errors, ["manifest: global_hook_files must be an array"]);
  assert.deepEqual(hookFileErrors([null], ok).errors, ["manifest: global_hook_files entries must be objects"]);
  assert.deepEqual(
    hookFileErrors([{ name: "bad name", path: "hooks/hook.py", executable: false }], ok).errors,
    ["manifest: invalid global hook file name bad name"],
  );
  assert.deepEqual(
    hookFileErrors(
      [
        { name: "hook.py", path: "hooks/hook.py", executable: false },
        { name: "hook.py", path: "hooks/hook.py", executable: false },
      ],
      ok,
    ).errors,
    ["manifest: duplicate global hook file name hook.py"],
  );

  let inspected = 0;
  assert.deepEqual(
    hookFileErrors([{ name: "hook.py", path: "/abs", executable: false }], {
      isSafeRelativePath,
      inspectTarget: () => (inspected += 1, { exists: true, isFile: true, executable: true }),
    }).errors,
    ["manifest: unsafe global hook path for hook.py"],
  );
  assert.equal(inspected, 0);

  assert.deepEqual(
    hookFileErrors([{ name: "hook.py", path: "hooks/hook.py" }], ok).errors,
    ["manifest: executable must be boolean for global hook hook.py"],
  );
  assert.deepEqual(
    hookFileErrors([{ name: "hook.py", path: "hooks/hook.py", executable: false }], {
      isSafeRelativePath,
      inspectTarget: () => ({ exists: false, isFile: false, executable: false }),
    }).errors,
    ["manifest: missing global hook target for hook.py"],
  );
  assert.deepEqual(
    hookFileErrors([{ name: "hook.py", path: "hooks/hook.py", executable: true }], {
      isSafeRelativePath,
      inspectTarget: () => ({ exists: true, isFile: true, executable: false }),
    }).errors,
    ["manifest: global hook target is not executable for hook.py"],
  );
});

test("legacyHookPathErrors validates legacy paths and overlaps", () => {
  const isSafeRelativePath = (value) => typeof value === "string" && !value.startsWith("/");
  assert.deepEqual(legacyHookPathErrors([], { isSafeRelativePath, hookNames: new Set() }).errors, []);
  assert.deepEqual(legacyHookPathErrors("nope", { isSafeRelativePath, hookNames: new Set() }).errors, [
    "manifest: legacy_global_hook_paths must be an array",
  ]);
  assert.deepEqual(
    legacyHookPathErrors(["/abs", "/abs"], { isSafeRelativePath, hookNames: new Set() }).errors,
    [
      "manifest: unsafe legacy global hook path /abs",
      "manifest: unsafe legacy global hook path /abs",
      "manifest: duplicate legacy global hook path /abs",
    ],
  );
  assert.deepEqual(
    legacyHookPathErrors(["legacy/hook.py"], { isSafeRelativePath, hookNames: new Set(["hook.py"]) }).errors,
    ["manifest: legacy global hook path overlaps installed hook legacy/hook.py"],
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
  const base = { name: "old", replacement: "current" };
  assert.deepEqual(retirementErrors([base], local), { errors: [], names: new Set(["old"]) });
  assert.deepEqual(retirementErrors([{ ...base, replacement: null }], local).errors, []);
  const cases = [
    [(doc) => (doc.replacement = "ghost"), /has unknown replacement ghost/],
    [(doc) => (doc.replacement = "old"), /cannot replace itself/],
    [(doc) => (doc.name = "Bad"), /invalid retired skill name/],
    [(doc) => (doc.extra = true), /must contain only name and replacement/],
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

test("manifest rule helpers never throw on malformed fields", () => {
  assert.doesNotThrow(() => legacyHookPathErrors(["hooks/x.py", null], { isSafeRelativePath, hookNames: new Set() }));
  assert.ok(legacyHookPathErrors([null], { isSafeRelativePath, hookNames: new Set() }).errors.length > 0);
  assert.doesNotThrow(() => retirementErrors({}, new Set()));
  assert.doesNotThrow(() => retirementErrors(5, new Set()));
});
