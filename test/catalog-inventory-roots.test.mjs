import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { resolveInventoryRoots } from "../scripts/lib/catalog-inventory-roots.mjs";

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
