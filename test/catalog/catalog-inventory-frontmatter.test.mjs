import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inventoryCapabilities } from "../../scripts/lib/catalog/catalog-inventory.mjs";
import {
  parseSkillFrontmatter,
  sanitizeMetadataValue,
  validSkillName,
} from "../../scripts/lib/catalog/catalog-inventory-frontmatter.mjs";

test("sanitizeMetadataValue strips quotes, collapses whitespace, and truncates", () => {
  assert.equal(sanitizeMetadataValue('"Demo  skill"'), "Demo skill");
  assert.equal(sanitizeMetadataValue("'single'"), "single");
  assert.equal(sanitizeMetadataValue("a\n b\t c"), "a b c");
  assert.equal(sanitizeMetadataValue("x".repeat(400)).length, 320);
});

test("validSkillName accepts only lowercase dash names", () => {
  assert.equal(validSkillName("alpha-1"), true);
  assert.equal(validSkillName("Alpha"), false);
  assert.equal(validSkillName("a_b"), false);
  assert.equal(validSkillName(""), false);
  assert.equal(validSkillName(undefined), false);
});

test("parseSkillFrontmatter reads name and description up to the closer", () => {
  assert.deepEqual(parseSkillFrontmatter("---\nname: alpha\ndescription: \"Demo  skill\"\n---\nbody"), {
    name: "alpha",
    description: "Demo skill",
  });
  assert.equal(parseSkillFrontmatter("no frontmatter"), undefined);
  assert.deepEqual(parseSkillFrontmatter("---\nname: alpha\nunknown: x\n---"), { name: "alpha" });
});

test("inventoryCapabilities reads frontmatter through the filesystem glue", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-inv-")));
  try {
    const skillDirectory = path.join(root, "alpha");
    mkdirSync(skillDirectory);
    writeFileSync(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: alpha\ndescription: \"Demo  skill\"\n---\nbody\n",
    );

    const inventory = await inventoryCapabilities({
      skillRoots: [{ id: "test-root", path: root, scope: "user", readFrontmatter: true }],
      pluginCacheRoots: [],
    });

    assert.deepEqual(
      inventory.skills.map(({ id, name, description }) => ({ id, name, description })),
      [{ id: "alpha", name: "alpha", description: "Demo skill" }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
