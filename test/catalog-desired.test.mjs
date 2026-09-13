import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDesired, normalizeFamilies, pluginIdFromCachedSkillPath } from "../scripts/lib/catalog/catalog-desired.mjs";
import { QuarantineViolationError } from "../scripts/lib/catalog/catalog-errors.mjs";

const cached = (marketplace, plugin) =>
  `/home/u/.codex/plugins/cache/${marketplace}/${plugin}/1.0.0/skills/alpha/SKILL.md`;

const code = (expected) => (error) => {
  assert.equal(error.code, expected, error.message);
  return true;
};

test("normalizeFamilies defaults to the fixed family and normalizes extras", () => {
  assert.deepEqual(normalizeFamilies(undefined), ["superpowers"]);
  assert.deepEqual(normalizeFamilies(["MyFam", " x "]), ["superpowers", "myfam", "x"]);
  assert.throws(() => normalizeFamilies("nope"), /must be an array/);
  assert.throws(() => normalizeFamilies([""]), /non-empty strings/);
  assert.throws(() => normalizeFamilies([1]), /non-empty strings/);
});

test("pluginIdFromCachedSkillPath derives publisher@marketplace", () => {
  assert.equal(pluginIdFromCachedSkillPath(cached("market", "demo")), "demo@market");
  assert.equal(pluginIdFromCachedSkillPath("/home/u/.codex/skills/alpha/SKILL.md"), undefined);
  assert.equal(pluginIdFromCachedSkillPath("/plugins/cache/market/demo/1.0.0/skills/alpha/nope.md"), undefined);
  assert.equal(
    pluginIdFromCachedSkillPath("C:\\home\\.codex\\plugins\\cache\\market\\demo\\1.0.0\\skills\\alpha\\SKILL.md"),
    "demo@market",
  );
});

test("normalizeDesired normalizes a minimal desired document", () => {
  const result = normalizeDesired({ plugins: {}, mcpServers: {}, skills: {} }, normalizeFamilies(undefined));
  assert.deepEqual([...result.plugins], []);
  assert.deepEqual([...result.mcpServers], []);
  assert.deepEqual([...result.skills], []);
  assert.deepEqual([...result.pluginOwners], []);
});

test("normalizeDesired rejects non-object and invalid state documents", () => {
  assert.throws(() => normalizeDesired(null, normalizeFamilies(undefined)), /must be an object/);
  assert.throws(
    () => normalizeDesired({ skills: { "/a": "yes" } }, normalizeFamilies(undefined)),
    /must be boolean/,
  );
  assert.throws(
    () => normalizeDesired({ skills: { "/a": true, "/b/../a": false } }, normalizeFamilies(undefined)),
    /duplicate normalized path/,
  );
  assert.throws(
    () => normalizeDesired({ skills: { relative: true } }, normalizeFamilies(undefined)),
    /path must be absolute/,
  );
});

test("normalizeDesired enforces plugin family and quarantine policy", () => {
  assert.throws(
    () => normalizeDesired({ pluginFamilies: { demo: true } }, normalizeFamilies(undefined)),
    code("CONFIG_PLUGIN_FAMILY_ENABLE_UNSUPPORTED"),
  );
  assert.throws(
    () => normalizeDesired({ pluginFamilies: { "bad family": false } }, normalizeFamilies(undefined)),
    code("CONFIG_INVALID_PLUGIN_FAMILY"),
  );
  assert.throws(
    () => normalizeDesired({ plugins: { "superpowers@market": true } }, normalizeFamilies(undefined)),
    (error) => error instanceof QuarantineViolationError,
  );
  assert.throws(
    () => normalizeDesired({ skills: { "/opt/superpowers/SKILL.md": true } }, normalizeFamilies(undefined)),
    (error) => error instanceof QuarantineViolationError,
  );
  assert.throws(
    () => normalizeDesired({ plugins: { "demo@market": true }, pluginFamilies: { demo: false } }, normalizeFamilies(undefined)),
    code("CONFIG_PLUGIN_FAMILY_CONFLICT"),
  );
  assert.throws(
    () => normalizeDesired({ plugins: { "demo@a": true, "demo@b": true } }, normalizeFamilies(undefined)),
    code("CONFIG_PLUGIN_OWNER_CONFLICT"),
  );
});

test("normalizeDesired trusts plugin cache skills only through owners or aliases", () => {
  const trusted = normalizeDesired(
    { plugins: { "demo@market": true }, skills: { [cached("market", "demo")]: true } },
    normalizeFamilies(undefined),
  );
  assert.equal(trusted.skills.get(cached("market", "demo")), true);

  const aliased = normalizeDesired(
    {
      plugins: { "demo@market": true },
      skills: { [cached("other", "demo")]: true },
    },
    normalizeFamilies(undefined),
    { "demo@market": ["demo@other"] },
  );
  assert.equal(aliased.pluginSkillAliases.get("demo@market").has("demo@other"), true);

  assert.throws(
    () => normalizeDesired({ skills: { [cached("other", "demo")]: true } }, normalizeFamilies(undefined)),
    code("CONFIG_UNTRUSTED_PLUGIN_SKILL_ENABLE"),
  );
  assert.throws(
    () => normalizeDesired({}, normalizeFamilies(undefined), { "demo@market": ["demo@market"] }),
    code("CONFIG_INVALID_PLUGIN_SKILL_ALIASES"),
  );
});
