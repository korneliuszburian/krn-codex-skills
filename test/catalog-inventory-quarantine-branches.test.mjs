import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inventoryCapabilities } from "../scripts/lib/catalog-inventory.mjs";

const writeSkill = (directory, name) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: demo\n---\n`);
};

const withRoot = async (prefix, body) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  try {
    await body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("inventoryCapabilities records a quarantined plugin family and skips it", async () => {
  await withRoot("krn-inv-quarantine-", async (root) => {
    writeSkill(path.join(root, "market", "superpowers", "1.0.0", "skills", "x"), "x");
    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });
    assert.deepEqual(inventory.plugins, []);
    assert.deepEqual(inventory.hardQuarantine, [
      { kind: "plugin", id: "superpowers@market", evidence: "directory-name", sourceId: "cache" },
    ]);
  });
});

test("inventoryCapabilities records a quarantined plugin skill but keeps the plugin", async () => {
  await withRoot("krn-inv-skill-quarantine-", async (root) => {
    const version = path.join(root, "market", "demo", "1.0.0");
    writeSkill(path.join(version, "skills", "superpowers"), "superpowers");
    writeSkill(path.join(version, "skills", "alpha"), "alpha");
    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });
    assert.equal(inventory.plugins.length, 1);
    assert.deepEqual(inventory.plugins[0].skillPaths, [path.join(version, "skills", "alpha", "SKILL.md")]);
    assert.deepEqual(inventory.hardQuarantine, [
      {
        kind: "skill",
        id: "superpowers",
        evidence: "plugin-skill-name",
        sourceId: "cache",
        path: path.join(version, "skills", "superpowers", "SKILL.md"),
      },
    ]);
  });
});

test("inventoryCapabilities rejects symlinked versions and marketplaces", async () => {
  await withRoot("krn-inv-symlink-version-", async (root) => {
    mkdirSync(path.join(root, "market", "demo", "1.0.0"), { recursive: true });
    symlinkSync("1.0.0", path.join(root, "market", "demo", "evil"));
    await assert.rejects(
      inventoryCapabilities({ skillRoots: [], pluginCacheRoots: [{ id: "cache", path: root }] }),
      /must not be a symlink/,
    );
  });

  await withRoot("krn-inv-symlink-market-", async (root) => {
    mkdirSync(path.join(root, "market"), { recursive: true });
    symlinkSync("market", path.join(root, "linked"));
    await assert.rejects(
      inventoryCapabilities({ skillRoots: [], pluginCacheRoots: [{ id: "cache", path: root }] }),
      /Plugin marketplace 'linked' must not be a symlink/,
    );
  });
});

test("inventoryCapabilities quarantines a plugin by manifest name", async () => {
  await withRoot("krn-inv-manifest-name-", async (root) => {
    const metadata = path.join(root, "market", "demo", "1.0.0", ".codex-plugin");
    mkdirSync(metadata, { recursive: true });
    writeFileSync(path.join(metadata, "plugin.json"), JSON.stringify({ name: "superpowers" }));

    const inventory = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: root }],
    });
    assert.deepEqual(inventory.plugins, []);
    assert.deepEqual(inventory.hardQuarantine, [
      {
        kind: "plugin",
        id: "superpowers",
        evidence: "manifest-name",
        sourceId: "cache",
        path: path.join(root, "market", "demo", "1.0.0"),
      },
    ]);
  });
});

test("inventoryCapabilities records quarantined configured roots and skips them", async () => {
  await withRoot("krn-inv-quarantine-root-", async (root) => {
    const quarantined = path.join(root, "superpowers");
    mkdirSync(quarantined, { recursive: true });

    const skills = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: quarantined, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.deepEqual(skills.skills, []);
    assert.deepEqual(skills.hardQuarantine, [
      { kind: "skill", id: "superpowers", evidence: "configured-root", sourceId: "root" },
    ]);

    const plugins = await inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "cache", path: quarantined }],
    });
    assert.deepEqual(plugins.plugins, []);
    assert.deepEqual(plugins.hardQuarantine, [
      { kind: "plugin", id: "superpowers", evidence: "configured-root", sourceId: "cache" },
    ]);
  });
});
