import assert from "node:assert/strict";
import test from "node:test";

import { readFrontmatter } from "../scripts/lib/install/skill-metadata.mjs";

test("readFrontmatter extracts name and description and strips quotes", () => {
  assert.deepEqual(readFrontmatter('---\nname: demo\ndescription: "a skill"\n---\nbody'), {
    name: "demo",
    description: "a skill",
  });
});

test("readFrontmatter returns null without a frontmatter block", () => {
  assert.equal(readFrontmatter("no frontmatter"), null);
});
