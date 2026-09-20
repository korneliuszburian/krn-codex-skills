import assert from "node:assert/strict";
import test from "node:test";
import { slugify } from "./slug.mjs";
test("slugify collapses to dashes and trims", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  A  B  "), "a-b");
  assert.equal(slugify("--x--"), "x");
});
