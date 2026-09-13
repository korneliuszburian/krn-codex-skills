import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { managedHookPolicy } from "../../scripts/lib/install/install-release.mjs";

const withRequirements = (body, run) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-req-")));
  const file = path.join(dir, "requirements.toml");
  writeFileSync(file, body);
  try {
    run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("managedHookPolicy reports inert for top-level allow_managed_hooks_only", () => {
  withRequirements("allow_managed_hooks_only = true\n", (file) => {
    const policy = managedHookPolicy({ requirementsPath: file });
    assert.equal(policy.status, "hook_inert_by_managed_policy");
  });
});

test("managedHookPolicy reports inert when the managed [features] table disables hooks", () => {
  withRequirements("[features]\nhooks = false\n", (file) => {
    const policy = managedHookPolicy({ requirementsPath: file });
    assert.equal(policy.status, "hook_inert_features_disabled");
  });
});

test("managedHookPolicy stays active for any other or absent requirements file", () => {
  withRequirements("allow_managed_hooks_only = false\n[features]\nhooks = true\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
  assert.equal(
    managedHookPolicy({ requirementsPath: path.join(tmpdir(), "krn-absent-requirements.toml") }).status,
    "no_managed_requirements",
  );
});

test("managedHookPolicy honours the top-level-only rule for allow_managed_hooks_only", () => {
  withRequirements("[hooks]\nallow_managed_hooks_only = true\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
});
