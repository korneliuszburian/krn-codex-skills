import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { resolveInventoryRoots } from "../../scripts/lib/catalog/catalog-inventory.mjs";
import { inventoryCapabilities } from "../../scripts/lib/catalog/catalog-inventory.mjs";

test("inventoryCapabilities resolves a relative CODEX_HOME to absolute paths", async () => {
  const base = mkdtempSync(join(tmpdir(), "krn-inv-relative-"));
  const previous = process.env.CODEX_HOME;
  const cwd = process.cwd();
  try {
    mkdirSync(join(base, "relcodex", "skills", "demo"), { recursive: true });
    writeFileSync(join(base, "relcodex", "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: d\n---\n");
    process.env.CODEX_HOME = "relcodex";
    process.chdir(base);
    const inventory = await inventoryCapabilities();
    const demo = inventory.skills.find((skill) => skill.id === "demo");
    assert.ok(demo, JSON.stringify(inventory.skills.map((skill) => skill.id)));
    assert.ok(isAbsolute(demo.path), demo.path);
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    rmSync(base, { recursive: true, force: true });
  }
});

test("resolveInventoryRoots derives the default codex and agent roots", () => {
  const { skillRoots, pluginCacheRoots } = resolveInventoryRoots({
    codexHome: "/home/u/.codex",
    agentsHome: "/home/u/.agents",
  });
  assert.deepEqual(
    skillRoots.map((root) => [root.id, root.path, root.scope]),
    [
      ["codex-user-skills", join("/home/u/.codex", "skills"), "user"],
      ["codex-system-skills", join("/home/u/.codex", "skills", ".system"), "system"],
      ["agent-global-index", join("/home/u/.agents", "skills"), "global-index"],
      ["opencode-skills", join("/home/u/.config/opencode", "skills"), "vendor-global"],
    ],
  );
  assert.deepEqual(pluginCacheRoots, [
    { id: "codex-plugin-cache", path: join("/home/u/.codex", "plugins", "cache") },
  ]);
});

test("resolveInventoryRoots passes explicit roots through unchanged", () => {
  const skillRoots = [{ id: "custom", path: "/skills", scope: "vendor-global" }];
  const pluginCacheRoots = [{ id: "cache", path: "/cache" }];
  assert.deepEqual(resolveInventoryRoots({ skillRoots, pluginCacheRoots }), {
    skillRoots,
    pluginCacheRoots,
  });
});

test("resolveInventoryRoots rejects invalid roots", () => {
  assert.throws(() => resolveInventoryRoots({ skillRoots: "nope" }), /skillRoots must be an array/);
  assert.throws(
    () => resolveInventoryRoots({ skillRoots: [{ id: "x", path: "/x", scope: "project-local" }] }),
    /unsupported scope 'project-local'/,
  );
  assert.throws(
    () => resolveInventoryRoots({ pluginCacheRoots: [{ id: "x" }] }),
    /needs string id and path/,
  );
});

test("resolveInventoryRoots resolves provided relative roots", () => {
  const { skillRoots } = resolveInventoryRoots({
    skillRoots: [{ id: "rel", path: "rel/skills", scope: "user" }],
    pluginCacheRoots: [],
  });
  assert.ok(isAbsolute(skillRoots[0].path), skillRoots[0].path);
});
