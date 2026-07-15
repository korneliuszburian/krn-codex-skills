import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { planCatalogConfig } from "./lib/catalog-config.mjs";
import { resolveProfile } from "./lib/catalog-profile.mjs";

test("resolves lexical quarantine evidence without executing the CLI", async (context) => {
  const quarantinedSkillPath =
    "/home/example/.agents/skills/quarantined-sentinel/SKILL.md";
  const currentPluginSkillPath =
    "/home/example/.codex/plugins/cache/marketplace/figma/2.0.0/skills/figma-use/SKILL.md";
  const historicalPluginSkillPath =
    "/home/example/.codex/plugins/cache/marketplace/figma/1.0.0/skills/figma-use/SKILL.md";
  const enabledGithubSkillPath =
    "/home/example/.codex/plugins/cache/curated/github/2.0.0/skills/github/SKILL.md";
  const legacyGithubSkillPath =
    "/home/example/.codex/plugins/cache/curated-remote/github/1.0.0/skills/github/SKILL.md";
  const privateGithubSkillPath =
    "/home/example/.codex/plugins/cache/private/github/1.0.0/skills/github/SKILL.md";
  const explicitlyDisabledGithubSkillPath =
    "/home/example/.codex/plugins/cache/private-explicit/github/1.0.0/skills/github/SKILL.md";
  const profile = {
    plugins: {
      enable: ["github@curated"],
      disable: ["github@curated-remote", "github@private-explicit"],
      disableFamilies: ["figma"],
    },
    skills: {
      enable: [],
      enableFamilies: [],
      disable: [],
      disableFamilies: [],
      preserveScopes: ["project-local"],
    },
    mcps: { enable: [], disable: [] },
    apps: { enable: [], disable: [], mode: "report-only" },
  };
  const inventory = {
    plugins: [
      {
        id: "figma@marketplace",
        family: "figma",
        skillPaths: [currentPluginSkillPath],
        allSkillPaths: [historicalPluginSkillPath, currentPluginSkillPath],
      },
      {
        id: "github@curated",
        family: "github",
        skillPaths: [enabledGithubSkillPath],
        allSkillPaths: [enabledGithubSkillPath],
      },
      {
        id: "github@curated-remote",
        family: "github",
        skillPaths: [legacyGithubSkillPath],
        allSkillPaths: [legacyGithubSkillPath],
      },
      {
        id: "github@private",
        family: "github",
        skillPaths: [privateGithubSkillPath],
        allSkillPaths: [privateGithubSkillPath],
      },
      {
        id: "github@private-explicit",
        family: "github",
        skillPaths: [explicitlyDisabledGithubSkillPath],
        allSkillPaths: [explicitlyDisabledGithubSkillPath],
      },
    ],
    skills: [],
    hardQuarantine: [
      {
        kind: "plugin",
        id: "quarantined-sentinel@marketplace",
        evidence: "directory-name",
      },
      {
        kind: "skill",
        id: "quarantined-sentinel",
        path: quarantinedSkillPath,
        evidence: "directory-name",
      },
    ],
  };

  const resolved = resolveProfile(
    profile,
    inventory,
    { pluginIds: ["quarantined-sentinel@required-marketplace"] },
    { "github@curated": ["github@curated-remote"] },
  );

  assert.equal(resolved.desired.pluginFamilies.figma, false);
  assert.equal(
    resolved.desired.plugins["quarantined-sentinel@marketplace"],
    false,
  );
  assert.equal(
    resolved.desired.plugins["quarantined-sentinel@required-marketplace"],
    false,
  );
  assert.equal(resolved.desired.skills[quarantinedSkillPath], false);
  assert.equal(resolved.desired.plugins["figma@marketplace"], false);
  assert.equal(resolved.desired.skills[currentPluginSkillPath], false);
  assert.equal(resolved.desired.skills[historicalPluginSkillPath], false);
  assert.equal(resolved.desired.plugins["github@curated"], true);
  assert.equal(resolved.desired.plugins["github@curated-remote"], false);
  assert.equal(resolved.desired.skills[enabledGithubSkillPath], true);
  assert.equal(resolved.desired.skills[legacyGithubSkillPath], true);
  assert.equal(resolved.desired.plugins["github@private"], false);
  assert.equal(resolved.desired.skills[privateGithubSkillPath], false);
  assert.equal(resolved.desired.plugins["github@private-explicit"], false);
  assert.equal(
    resolved.desired.skills[explicitlyDisabledGithubSkillPath],
    false,
  );

  const aliasPlan = planCatalogConfig({
    source: [
      '[plugins."github@curated-remote"]',
      "enabled = false",
      "",
      "[[skills.config]]",
      `path = "${legacyGithubSkillPath}"`,
      "enabled = false",
      "",
    ].join("\n"),
    desired: resolved.desired,
    pluginSkillAliases: {
      "github@curated": ["github@curated-remote"],
    },
  });
  assert.equal(aliasPlan.nextSource.includes(legacyGithubSkillPath), false);

  const cliUrl = new URL("./catalog.mjs", import.meta.url).href;
  const imported = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `await import(${JSON.stringify(cliUrl)})`],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");

  const fixture = await mkdtemp(join(tmpdir(), "catalog-entrypoint-"));
  context.after(async () => rm(fixture, { recursive: true, force: true }));
  const sourcePath = fileURLToPath(new URL("./catalog.mjs", import.meta.url));
  const linkedPath = join(fixture, "krn-codex-catalog");
  await symlink(sourcePath, linkedPath);
  const invoked = spawnSync(process.execPath, [linkedPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.match(invoked.stdout, /KRN Codex capability catalog/);
});

test("clears plugin skill overrides when a capability family is re-enabled", () => {
  const skillPath =
    "/home/example/.codex/plugins/cache/curated/figma/2.0.0/skills/figma-use/SKILL.md";
  const inventory = {
    plugins: [
      {
        id: "figma@curated",
        family: "figma",
        skillPaths: [skillPath],
        allSkillPaths: [skillPath],
      },
    ],
    skills: [],
    hardQuarantine: [],
  };
  const profile = (plugins) => ({
    plugins: { enable: [], disable: [], disableFamilies: [], ...plugins },
    skills: {
      enable: [],
      enableFamilies: [],
      disable: [],
      disableFamilies: [],
      preserveScopes: [],
    },
    mcps: { enable: [], disable: [] },
    apps: { enable: [], disable: [], mode: "report-only" },
  });
  const source = '[plugins."figma@curated"]\nenabled = true\n';

  const disabled = resolveProfile(
    profile({ disable: ["figma@curated"] }),
    inventory,
  );
  const disabledPlan = planCatalogConfig({ source, desired: disabled.desired });
  assert.match(
    disabledPlan.nextSource,
    /figma-use\/SKILL\.md"\nenabled = false/,
  );

  const enabled = resolveProfile(
    profile({ enable: ["figma@curated"] }),
    inventory,
  );
  assert.equal(enabled.desired.skills[skillPath], true);
  const enabledPlan = planCatalogConfig({
    source: disabledPlan.nextSource,
    desired: enabled.desired,
  });
  assert.equal(enabledPlan.nextSource.includes("figma-use/SKILL.md"), false);

  const converged = planCatalogConfig({
    source: enabledPlan.nextSource,
    desired: enabled.desired,
  });
  assert.equal(converged.changed, false);
});

test("disables config-only siblings of the enabled plugin owner", () => {
  const ownerSkillPath =
    "/home/example/.codex/plugins/cache/curated/github/2.0.0/skills/github/SKILL.md";
  const privateSkillPath =
    "/home/example/.codex/plugins/cache/private/github/1.0.0/skills/github/SKILL.md";
  const profile = {
    plugins: {
      enable: ["github@curated"],
      disable: [],
      disableFamilies: [],
    },
    skills: {
      enable: [],
      enableFamilies: [],
      disable: [],
      disableFamilies: [],
      preserveScopes: [],
    },
    mcps: { enable: [], disable: [] },
    apps: { enable: [], disable: [], mode: "report-only" },
  };
  const inventory = {
    plugins: [
      {
        id: "github@curated",
        family: "github",
        skillPaths: [ownerSkillPath],
        allSkillPaths: [ownerSkillPath],
      },
    ],
    skills: [],
    hardQuarantine: [],
  };
  const source = [
    '[plugins."github@private"]',
    "enabled = true",
    "",
    "[[skills.config]]",
    `path = "${privateSkillPath}"`,
    "enabled = true",
    "",
  ].join("\n");

  const resolved = resolveProfile(profile, inventory);
  assert.equal(resolved.desired.plugins["github@curated"], true);

  const plan = planCatalogConfig({ source, desired: resolved.desired });
  assert.match(
    plan.nextSource,
    /\[plugins\."github@private"\]\nenabled = false/,
  );
  assert.match(
    plan.nextSource,
    /\/private\/github\/1\.0\.0\/skills\/github\/SKILL\.md"\nenabled = false/,
  );
  assert.match(
    plan.nextSource,
    /\[plugins\."github@curated"\]\nenabled = true/,
  );

  const converged = planCatalogConfig({
    source: plan.nextSource,
    desired: resolved.desired,
  });
  assert.equal(converged.changed, false);
});
