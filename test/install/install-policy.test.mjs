import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("managedHookPolicy reads dotted and inline features tables", () => {
  withRequirements("features.hooks = false\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  withRequirements("features = { hooks = false }\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
});

test("managedHookPolicy parses booleans with a trailing comment and ignores array tables", () => {
  withRequirements("allow_managed_hooks_only = true# managed\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_by_managed_policy");
  });
  withRequirements("[[features]]\nhooks = false\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
});

test("managedHookPolicy reads quoted and nested inline features keys", () => {
  withRequirements('features = { "hooks" = false }\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  withRequirements("features = { nested = { x = 1 }, hooks = false }\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
});

test("managedHookPolicy parses inline tables structurally", () => {
  withRequirements('features = { "ho\\u006fks" = false }\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  for (const source of [
    "features = { hooks = true } # hooks = false\n",
    'features = { note = "see hooks = false here" }\n',
    "features = { nested = { hooks = false } }\n",
  ]) {
    withRequirements(source, (file) => {
      assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active", source);
    });
  }
});

test("managedHookPolicy is not confused by array contents or a quoted single key", () => {
  withRequirements("a = [\n  [1],\n]\nfeatures.hooks = false\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  withRequirements("a = [\n  [1]\n]\nallow_managed_hooks_only = true\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_by_managed_policy");
  });
  withRequirements('a = ["""\nx\n"""]\n[features]\nhooks = false\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  // A `'''` inside a `"""` string must not be mistaken for the closer.
  withRequirements(`a = [\n"""\nx\n''' y """ ]\n[features]\nhooks = false\n`, (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  // A quote and a bracket inside the literal string body are not structural.
  withRequirements(`note = '''it's [draft\n'''\n[features]\nhooks = false\n`, (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  // A TOML unicode escape in the key decodes to the managed key.
  withRequirements('[features]\n"\\U00000068ooks" = false\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  withRequirements('"features.hooks" = false\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
});

test("managedHookPolicy reports unreadable instead of throwing on a bad string key", () => {
  withRequirements('[features]\nhooks = true\n"C:\\x" = "y"\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "requirements_unreadable");
  });
});

test("managedHookPolicy does not treat an array table as the root scope", () => {
  withRequirements("[[policies]]\nallow_managed_hooks_only = true\n", (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
});

test("managedHookPolicy ignores table headers inside multi-line strings", () => {
  withRequirements('[features]\nnotes = """\n[other]\n"""\nhooks = false\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hook_inert_features_disabled");
  });
  withRequirements('note = """\n[features]\n"""\nhooks = false\n', (file) => {
    assert.equal(managedHookPolicy({ requirementsPath: file }).status, "hooks_active");
  });
});

test("managedHookPolicy reports unreadable for a non-regular requirements path", () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-req-")));
  const target = path.join(dir, "real.toml");
  writeFileSync(target, "[features]\nhooks = false\n");
  const link = path.join(dir, "requirements.toml");
  symlinkSync(target, link);
  try {
    assert.equal(managedHookPolicy({ requirementsPath: link }).status, "requirements_unreadable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
