import assert from "node:assert/strict";
import test from "node:test";

import { readFrontmatter } from "../../scripts/lib/install/skill-metadata.mjs";

test("readFrontmatter extracts name and description and strips quotes", () => {
  assert.deepEqual(readFrontmatter('---\nname: demo\ndescription: "a skill"\n---\nbody'), {
    name: "demo",
    description: "a skill",
  });
});

test("readFrontmatter returns null without a frontmatter block", () => {
  assert.equal(readFrontmatter("no frontmatter"), null);
});

test("readFrontmatter preserves a plain scalar that ends in a quote", () => {
  assert.equal(readFrontmatter('---\nname: demo\ndescription: he said "hi"\n---\n').description, 'he said "hi"');
  assert.equal(readFrontmatter("---\nname: demo\ndescription: users'\n---\n").description, "users'");
});

test("readFrontmatter agrees with the validator on a single-quoted scalar", () => {
  assert.equal(readFrontmatter("---\nname: 'demo'\ndescription: x\n---\n").name, "'demo'");
});
