import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runtimeClosureErrors } from "../../scripts/lib/contract/runtime-closure.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "krn-installsh-"));
  mkdirSync(join(base, "scripts", "lib"), { recursive: true });
  mkdirSync(join(base, "config", "opencode", "plugins"), { recursive: true });
  writeFileSync(
    join(base, "scripts", "entry.mjs"),
    'const profile = "scripts/lib/data.json";\nexport const entry = profile;\n',
  );
  writeFileSync(join(base, "scripts", "lib", "data.json"), "{}\n");
  writeFileSync(
    join(base, "config", "opencode", "plugins", "adapter.js"),
    "export default () => {};\n",
  );
  writeFileSync(join(base, "scripts", "orphan.sh"), "#!/usr/bin/env bash\n");
  const manifest = {
    bins: [{ path: "scripts/entry.mjs" }],
    opencode_plugins: [{ path: "config/opencode/plugins/adapter.js" }],
    runtime_paths: [
      "config/opencode/plugins/adapter.js",
      "scripts/entry.mjs",
      "scripts/lib/data.json",
      "scripts/orphan.sh",
    ],
  };
  return { base, manifest };
}

test("an unconsumed non-module runtime path is unreachable-non-module", () => {
  const { base, manifest } = fixture();
  try {
    const errors = runtimeClosureErrors({ root: base, manifest });
    assert.ok(
      errors.some(
        (error) => error.includes("unreachable-non-module") && error.includes("scripts/orphan.sh"),
      ),
      JSON.stringify(errors),
    );
    assert.ok(!errors.some((error) => error.includes("scripts/lib/data.json")), JSON.stringify(errors));
    assert.ok(
      !errors.some((error) => error.includes("config/opencode/plugins/adapter.js")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the repository manifest retires scripts/install.sh and stays clean", () => {
  const manifest = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8"));
  assert.ok(!manifest.runtime_paths.includes("scripts/install.sh"));
  assert.deepEqual(runtimeClosureErrors({ root, manifest }), []);
});
