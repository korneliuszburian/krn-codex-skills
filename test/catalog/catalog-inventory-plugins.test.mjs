import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { inventoryCapabilities, resolveInventoryRoots } from "../../scripts/lib/catalog/catalog-inventory.mjs";

const skillFile = (directory, name) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: demo\n---\n`);
};

test("inventoryCapabilities walks a plugin cache with versions, manifest, and skills", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-plugins-")));
  try {
    const pluginPath = path.join(root, "market", "demo-family");
    skillFile(path.join(pluginPath, "1.0.0", "skills", "alpha"), "alpha");
    skillFile(path.join(pluginPath, "2.0.0", "skills", "beta"), "beta");
    mkdirSync(path.join(pluginPath, "2.0.0", ".codex-plugin"), { recursive: true });
    writeFileSync(
      path.join(pluginPath, "2.0.0", ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "Demo Plugin" }),
    );
    symlinkSync("2.0.0", path.join(pluginPath, "latest"));

    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });

    assert.equal(inventory.plugins.length, 1);
    const [plugin] = inventory.plugins;
    assert.equal(plugin.id, "demo-family@market");
    assert.equal(plugin.family, "demo-family");
    assert.equal(plugin.marketplace, "market");
    assert.equal(plugin.currentVersion, "2.0.0");
    assert.deepEqual(plugin.versions, ["1.0.0", "2.0.0"]);
    assert.equal(plugin.manifestName, "Demo Plugin");
    assert.deepEqual(plugin.skillPaths, [path.join(pluginPath, "2.0.0", "skills", "beta", "SKILL.md")]);
    assert.deepEqual(plugin.allSkillPaths, [
      path.join(pluginPath, "1.0.0", "skills", "alpha", "SKILL.md"),
      path.join(pluginPath, "2.0.0", "skills", "beta", "SKILL.md"),
    ].sort());
    assert.deepEqual(inventory.hardQuarantine, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventoryCapabilities ignores a plugin cache with no version directories", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-plugins-empty-")));
  try {
    mkdirSync(path.join(root, "market", "empty-family"), { recursive: true });
    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });
    assert.deepEqual(inventory.plugins, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const manifestNameFor = async (prefix, writeManifest) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  try {
    const version = path.join(root, "market", "demo", "1.0.0");
    skillFile(path.join(version, "skills", "alpha"), "alpha");
    writeManifest(version);
    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });
    return inventory.plugins[0]?.manifestName;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("inventoryCapabilities resolves plugin manifest candidates in order", async () => {
  assert.equal(
    await manifestNameFor("krn-manifest-preferred-", (version) => {
      mkdirSync(path.join(version, ".codex-plugin"), { recursive: true });
      writeFileSync(path.join(version, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "Preferred" }));
      writeFileSync(path.join(version, "plugin.json"), JSON.stringify({ name: "PluginJson" }));
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "ManifestJson" }));
    }),
    "Preferred",
  );
  assert.equal(
    await manifestNameFor("krn-manifest-plugin-", (version) => {
      writeFileSync(path.join(version, "plugin.json"), JSON.stringify({ name: "PluginJson" }));
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "ManifestJson" }));
    }),
    "PluginJson",
  );
  assert.equal(
    await manifestNameFor("krn-manifest-fallback-", (version) => {
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "ManifestJson" }));
    }),
    "ManifestJson",
  );
  assert.equal(await manifestNameFor("krn-manifest-none-", () => {}), "demo");
});

test("inventoryCapabilities skips a directory-valued or oversized manifest", async () => {
  assert.equal(
    await manifestNameFor("krn-manifest-dir-", (version) => {
      mkdirSync(path.join(version, "plugin.json"), { recursive: true });
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "Fallback" }));
    }),
    "Fallback",
  );
  assert.equal(
    await manifestNameFor("krn-manifest-big-", (version) => {
      writeFileSync(path.join(version, "plugin.json"), Buffer.alloc(70 * 1024, 32));
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "Small" }));
    }),
    "Small",
  );
  assert.equal(
    await manifestNameFor("krn-manifest-symlink-", (version) => {
      writeFileSync(path.join(version, "target.json"), JSON.stringify({ name: "ViaSymlink" }));
      symlinkSync("target.json", path.join(version, "plugin.json"));
      writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ name: "AfterSymlink" }));
    }),
    "AfterSymlink",
  );
});

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
