import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inventoryCapabilities } from "../scripts/lib/catalog-inventory.mjs";

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
