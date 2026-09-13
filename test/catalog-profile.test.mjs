import assert from "node:assert/strict";
import test from "node:test";

import { resolveProfile } from "../scripts/lib/catalog/catalog-profile.mjs";

const plugin = (over = {}) => ({
  id: "demo@market",
  family: "demo",
  name: "demo",
  skillPaths: ["/cache/market/demo/1.0.0/skills/alpha/SKILL.md"],
  ...over,
});
const skill = (over = {}) => ({
  id: "alpha",
  name: "alpha",
  family: "alpha",
  path: "/skills/engineering/alpha/SKILL.md",
  scope: "user",
  ...over,
});
const inventory = (over = {}) => ({ plugins: [], skills: [], hardQuarantine: [], ...over });
const profile = (over = {}) => ({ plugins: {}, skills: {}, mcps: {}, apps: {}, ...over });

test("resolves plugin selectors and reports unresolved ones", () => {
  const result = resolveProfile(
    profile({ plugins: { enable: ["demo@market"], disable: ["ghost@market"] } }),
    inventory({ plugins: [plugin()] }),
  );
  assert.equal(result.desired.plugins["demo@market"], true);
  assert.deepEqual(result.unresolved.plugins, ["ghost@market"]);
  assert.deepEqual(result.unresolved.skills, []);
  assert.equal(result.apps.mode, "report-only");
});

test("disables plugin families and unowned siblings", () => {
  const result = resolveProfile(
    profile({ plugins: { enable: ["demo@market"], disableFamilies: ["other"] } }),
    inventory({
      plugins: [
        plugin(),
        plugin({ id: "other@market", family: "other", name: "other", skillPaths: ["/cache/market/other/skills/gamma/SKILL.md"] }),
        plugin({ id: "demo@other-market", family: "demo", name: "sibling", skillPaths: ["/cache/other/demo/skills/beta/SKILL.md"] }),
      ],
    }),
  );
  assert.equal(result.desired.pluginFamilies.other, false);
  assert.equal(result.desired.plugins["other@market"], false);
  assert.equal(result.desired.plugins["demo@market"], true);
  assert.equal(result.desired.plugins["demo@other-market"], false);
});

test("resolves skill selectors, families, and preserveScopes", () => {
  const enabled = resolveProfile(
    profile({ skills: { enable: ["alpha"] } }),
    inventory({ skills: [skill()] }),
  );
  assert.equal(enabled.desired.skills["/skills/engineering/alpha/SKILL.md"], true);

  const family = resolveProfile(
    profile({ skills: { enableFamilies: ["beta"] } }),
    inventory({ skills: [skill({ id: "beta", name: "beta", family: "beta", path: "/skills/beta/SKILL.md" })] }),
  );
  assert.equal(family.desired.skills["/skills/beta/SKILL.md"], true);

  const preserved = resolveProfile(
    profile({ skills: { enableFamilies: ["gamma"], preserveScopes: ["project-local"] } }),
    inventory({ skills: [skill({ id: "gamma", name: "gamma", family: "gamma", path: "/p/gamma", scope: "project-local" })] }),
  );
  assert.equal(preserved.desired.skills["/p/gamma"], undefined);
});

test("throws on conflicting policy", () => {
  assert.throws(
    () => resolveProfile(profile({ plugins: { enable: ["demo@market"], disable: ["demo@market"] } }), inventory()),
    /profile conflict for demo@market/,
  );
  assert.throws(
    () => resolveProfile(profile({ plugins: { enable: ["demo@a", "demo@b"] } }), inventory()),
    /multiple enabled owners/,
  );
  assert.throws(
    () => resolveProfile(profile({ skills: { enableFamilies: ["alpha"], disableFamilies: ["alpha"] } }), inventory({ skills: [skill()] })),
    /profile conflict for skill family alpha/,
  );
});

test("honors hard quarantine evidence and plugin ids", () => {
  const result = resolveProfile(
    profile(),
    inventory({ hardQuarantine: [{ kind: "plugin", id: "demo@market" }, { kind: "skill", path: "/skills/x/SKILL.md" }] }),
    { pluginIds: ["extra@market"] },
  );
  assert.equal(result.desired.plugins["demo@market"], false);
  assert.equal(result.desired.plugins["extra@market"], false);
  assert.equal(result.desired.skills["/skills/x/SKILL.md"], false);
});

test("enables trusted plugin skills and disables the rest of the family", () => {
  const result = resolveProfile(
    profile({ plugins: { enable: ["demo@market"] } }),
    inventory({
      plugins: [
        plugin(),
        plugin({ id: "demo@other-market", family: "demo", name: "sibling", skillPaths: ["/cache/other/demo/skills/beta/SKILL.md"] }),
      ],
    }),
  );
  assert.equal(result.desired.skills["/cache/market/demo/1.0.0/skills/alpha/SKILL.md"], true);
  assert.equal(result.desired.skills["/cache/other/demo/skills/beta/SKILL.md"], false);
  assert.equal(result.desired.plugins["demo@other-market"], false);
});

test("passes mcps and apps policy through", () => {
  const result = resolveProfile(
    profile({ mcps: { enable: ["mcp-a"], disable: ["mcp-b"] }, apps: { mode: "report-only", enable: ["a"], disable: [] } }),
    inventory(),
  );
  assert.equal(result.desired.mcpServers["mcp-a"], true);
  assert.equal(result.desired.mcpServers["mcp-b"], false);
  assert.deepEqual(result.apps, { mode: "report-only", enable: ["a"], disable: [] });
});
