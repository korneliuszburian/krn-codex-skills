import assert from "node:assert/strict";
import test from "node:test";

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inventoryCapabilities } from "../../scripts/lib/catalog/catalog-inventory.mjs";

import {
  compareInventoryRecords,
  createQuarantineCollector,
} from "../../scripts/lib/catalog/catalog-inventory-quarantine.mjs";

test("createQuarantineCollector matches the fixed family and reports none by default", () => {
  const quarantine = createQuarantineCollector([], []);
  assert.equal(quarantine.matches("superpowers@market"), true);
  assert.equal(quarantine.matches("skills"), false);
  assert.equal(quarantine.familyFor("x-superpowers-y"), "superpowers");
  assert.equal(quarantine.familyFor("skills"), undefined);
  assert.deepEqual(quarantine.values(), []);
});

test("createQuarantineCollector records sanitized unique evidence", () => {
  const quarantine = createQuarantineCollector(
    [{ kind: "plugin", id: "superpowers@market", evidence: "dir", sourceId: "root", path: "/x/superpowers" }],
    [],
  );
  assert.deepEqual(quarantine.values(), [
    {
      kind: "plugin",
      id: "superpowers@market",
      evidence: "dir",
      sourceId: "root",
      path: "/x/superpowers",
    },
  ]);
  quarantine.add("skill", "superpowers", "lexical", "root", "/p/superpowers");
  quarantine.add("skill", "superpowers", "lexical", "root", "/p/superpowers");
  quarantine.add("skill", "clean-name", "lexical", "root", "/p/clean");
  assert.equal(quarantine.values().length, 2);
});

test("createQuarantineCollector validates and lowercases additional families", () => {
  const quarantine = createQuarantineCollector([], ["MyFam"]);
  assert.equal(quarantine.matches("MYFAM-thing"), true);
  assert.equal(quarantine.familyFor("myfam-thing"), "myfam");
  assert.throws(() => createQuarantineCollector([], "nope"), /non-empty strings/);
  assert.throws(() => createQuarantineCollector([], [""]), /non-empty strings/);
  assert.throws(() => createQuarantineCollector([], [1]), /non-empty strings/);
});

test("sanitized labels drop control characters and cap length", () => {
  const quarantine = createQuarantineCollector([], []);
  quarantine.add("plugin", `superpowers\n\t${"x".repeat(400)}`, "dir\nname", "root");
  const [record] = quarantine.values();
  assert.equal(record.id.includes("\n"), false);
  assert.equal(record.id.includes("\t"), false);
  assert.equal(record.evidence, "dir name");
  assert.equal(record.id.length <= 160, true);
});

test("compareInventoryRecords sorts by kind, id, and sourceId", () => {
  const records = [
    { kind: "tool", id: "b", sourceId: "s" },
    { kind: "tool", id: "a", sourceId: "s" },
    { kind: "plugin", id: "z", sourceId: "s" },
  ];
  assert.deepEqual(
    [...records].sort(compareInventoryRecords).map((record) => `${record.kind}:${record.id}`),
    ["plugin:z", "tool:a", "tool:b"],
  );
});

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
        configId: "demo@market",
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

test("a dangling skill symlink is not inventoried as a capability", async () => {
  await withRoot("krn-inventory-dangling-", async (root) => {
    symlinkSync(path.join(root, "does-not-exist"), path.join(root, "ghost"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(!inventory.skills.some((skill) => skill.id === "ghost"), JSON.stringify(inventory.skills.map((skill) => skill.id)));
  });
});

test("a skill directory whose SKILL.md is a dangling file symlink is not inventoried", async () => {
  await withRoot("krn-inventory-dangling-file-", async (root) => {
    const directory = path.join(root, "ghost-file");
    mkdirSync(directory, { recursive: true });
    symlinkSync(path.join(root, "missing-skill.md"), path.join(directory, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(
      !inventory.skills.some((skill) => skill.id === "ghost-file"),
      JSON.stringify(inventory.skills.map((skill) => skill.id)),
    );
  });
});

test("a skill directory whose SKILL.md is a valid file symlink is inventoried", async () => {
  await withRoot("krn-inventory-file-link-", async (root) => {
    const target = path.join(root, "shared-skill.md");
    writeFileSync(target, "---\nname: linked\ndescription: demo\n---\n");
    const directory = path.join(root, "linked");
    mkdirSync(directory, { recursive: true });
    symlinkSync(target, path.join(directory, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    const record = inventory.skills.find((skill) => skill.id === "linked");
    assert.equal(record?.source, "file-symlink");
    assert.equal(record?.targetPath, realpathSync(target));
  });
});

test("a kernel-unresolvable symlink target (ENOTDIR or trailing slash) is not inventoried", async () => {
  await withRoot("krn-inventory-enotdir-", async (root) => {
    writeFileSync(path.join(root, "plain.md"), "not a directory\n");
    const dotted = path.join(root, "dotted");
    mkdirSync(path.join(dotted, "real"), { recursive: true });
    writeFileSync(path.join(dotted, "real", "SKILL.md"), "---\nname: d\ndescription: demo\n---\n");
    symlinkSync(`${path.join(root, "plain.md")}/../dotted/real/SKILL.md`, path.join(dotted, "SKILL.md"));
    writeFileSync(path.join(root, "other.md"), "not a dir\n");
    const slash = path.join(root, "slash");
    mkdirSync(slash, { recursive: true });
    symlinkSync(`${path.join(root, "other.md")}/`, path.join(slash, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    const ids = JSON.stringify(inventory.skills.map((skill) => skill.id));
    assert.ok(!inventory.skills.some((skill) => skill.id === "dotted"), ids);
    assert.ok(!inventory.skills.some((skill) => skill.id === "slash"), ids);
  });
});

test("a symlinked component before .. does not bypass quarantine", async () => {
  await withRoot("krn-inventory-sym-dotdot-", async (root) => {
    mkdirSync(path.join(root, "superpowers", "deep"), { recursive: true });
    mkdirSync(path.join(root, "superpowers", "clean"), { recursive: true });
    writeFileSync(path.join(root, "superpowers", "clean", "SKILL.md"), "---\nname: x\ndescription: demo\n---\n");
    mkdirSync(path.join(root, "demo-real", "clean"), { recursive: true });
    writeFileSync(path.join(root, "demo-real", "clean", "SKILL.md"), "---\nname: y\ndescription: demo\n---\n");
    symlinkSync("../superpowers/deep", path.join(root, "demo-real", "b"));
    symlinkSync("b/../clean/SKILL.md", path.join(root, "demo-real", "SKILL.md"));
    symlinkSync(path.join(root, "demo-real"), path.join(root, "demo"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    const ids = JSON.stringify(inventory.skills.map((skill) => skill.id));
    assert.ok(!inventory.skills.some((skill) => skill.id === "demo"), ids);
    assert.ok(!inventory.skills.some((skill) => skill.id === "demo-real"), ids);
  });
});

test("a link target with .. through a symlinked parent resolves POSIX-correctly", async () => {
  await withRoot("krn-inventory-dotdot-", async (root) => {
    const base = path.join(root, "base");
    mkdirSync(path.join(base, "nested"), { recursive: true });
    mkdirSync(path.join(base, "shared"), { recursive: true });
    writeFileSync(path.join(base, "shared", "SKILL.md"), "---\nname: shared\ndescription: demo\n---\n");
    symlinkSync("../shared/SKILL.md", path.join(base, "nested", "SKILL.md"));
    symlinkSync(path.join(base, "nested"), path.join(root, "x"));
    symlinkSync(path.join(root, "x"), path.join(root, "demo"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(
      inventory.skills.some((skill) => skill.id === "demo"),
      JSON.stringify(inventory.skills.map((skill) => skill.id)),
    );
  });
});

test("a chain through a clean-named directory symlink into quarantine is not inventoried", async () => {
  await withRoot("krn-inventory-alias-quarantine-", async (root) => {
    mkdirSync(path.join(root, "superpowers"), { recursive: true });
    writeFileSync(path.join(root, "superpowers", "bridge.md"), "---\nname: x\ndescription: demo\n---\n");
    symlinkSync(path.join(root, "superpowers"), path.join(root, "alias"));
    const directory = path.join(root, "demo");
    mkdirSync(directory, { recursive: true });
    symlinkSync(path.join(root, "alias", "bridge.md"), path.join(directory, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(
      !inventory.skills.some((skill) => skill.id === "demo"),
      JSON.stringify(inventory.skills.map((skill) => skill.id)),
    );
  });
});

test("a symlink chain through a quarantined family is not inventoried", async () => {
  await withRoot("krn-inventory-chain-quarantine-", async (root) => {
    mkdirSync(path.join(root, "superpowers"), { recursive: true });
    writeFileSync(path.join(root, "superpowers", "bridge.md"), "---\nname: x\ndescription: demo\n---\n");
    const intermediate = path.join(root, "step.md");
    symlinkSync(path.join(root, "superpowers", "bridge.md"), intermediate);
    const directory = path.join(root, "demo");
    mkdirSync(directory, { recursive: true });
    symlinkSync(intermediate, path.join(directory, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(
      !inventory.skills.some((skill) => skill.id === "demo"),
      JSON.stringify(inventory.skills.map((skill) => skill.id)),
    );
  });
});

test("a chained file symlink whose final target is missing is not inventoried", async () => {
  await withRoot("krn-inventory-chain-dangling-", async (root) => {
    const intermediate = path.join(root, "intermediate.md");
    symlinkSync(path.join(root, "missing-skill.md"), intermediate);
    const directory = path.join(root, "chained");
    mkdirSync(directory, { recursive: true });
    symlinkSync(intermediate, path.join(directory, "SKILL.md"));
    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "root", path: root, scope: "user" }],
      pluginCacheRoots: [],
    });
    assert.ok(
      !inventory.skills.some((skill) => skill.id === "chained"),
      JSON.stringify(inventory.skills.map((skill) => skill.id)),
    );
  });
});

test("a symlink target that traverses a quarantined family keeps its evidence id", async () => {
  await withRoot("krn-inv-symlink-traverse-", async (root) => {
    mkdirSync(path.join(root, "nested", "superpowers"), { recursive: true });
    mkdirSync(path.join(root, "clean"), { recursive: true });
    writeFileSync(path.join(root, "clean", "SKILL.md"), "---\nname: clean\ndescription: clean\n---\n");
    symlinkSync("nested/superpowers/../clean", path.join(root, "demo"));
    const inventory = await inventoryCapabilities({ skillRoots: [{ id: "root", path: root, scope: "user" }], pluginCacheRoots: [] });
    assert.ok(
      inventory.hardQuarantine.some((record) => record.evidence === "symlink-target" && record.id === "superpowers"),
      JSON.stringify(inventory.hardQuarantine),
    );
  });
});
