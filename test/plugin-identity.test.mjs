import assert from "node:assert/strict";
import test from "node:test";

import { matchesQuarantined, pluginFamilyFromId } from "../scripts/lib/plugin-identity.mjs";

test("pluginFamilyFromId parses a family from a plugin id", () => {
  assert.equal(pluginFamilyFromId("figma@openai-curated"), "figma");
  assert.equal(pluginFamilyFromId("no-separator"), undefined);
  assert.equal(pluginFamilyFromId("trailing@"), undefined);
  assert.equal(pluginFamilyFromId("@leading"), undefined);
  assert.equal(pluginFamilyFromId(42), undefined);
});

test("matchesQuarantined compares case-insensitively", () => {
  assert.equal(matchesQuarantined("superpowers@openai-curated", ["superpowers"]), true);
  assert.equal(matchesQuarantined("SuperPowers", ["superpowers"]), true);
  assert.equal(matchesQuarantined("figma@openai-curated", ["superpowers"]), false);
});
