import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  getCapabilityProfile,
  inventoryCapabilities,
  isHardQuarantined,
  loadCapabilityProfiles,
} from "./lib/catalog-inventory.mjs";

const QUARANTINE_SENTINEL = "blocked-family";

test("profiles and inventory expose only current, global, sanitized capabilities", async (context) => {
  const fixture = await mkdtemp(join(tmpdir(), "krn-catalog-inventory-"));
  context.after(async () => rm(fixture, { recursive: true, force: true }));

  const codexHome = join(fixture, ".codex");
  const agentsHome = join(fixture, ".agents");
  const userSkills = join(codexHome, "skills");
  const systemSkills = join(userSkills, ".system");
  const globalIndex = join(agentsHome, "skills");
  const pluginCache = join(codexHome, "plugins", "cache");
  const externalSkill = join(fixture, "installed", "implement");
  const projectSkill = join(fixture, "project", ".agents", "skills", "local-only");

  await writeSkill(join(userSkills, "agent-browser"), {
    name: "agent-browser",
    description: "Browser automation without leaking skill body content.",
  });
  await writeSkill(join(userSkills, "gsap-core"), { name: "gsap-core" });
  await writeSkill(join(systemSkills, "openai-docs"), { name: "openai-docs" });
  await mkdir(join(userSkills, QUARANTINE_SENTINEL), { recursive: true });
  await writeSkill(externalSkill, { name: "implement" });
  await writeSkill(projectSkill, { name: "local-only" });
  await mkdir(globalIndex, { recursive: true });
  await symlink(externalSkill, join(globalIndex, "implement"));

  await writePluginVersion(pluginCache, "openai-curated", "figma", "1.9.0", {
    manifestName: "figma-old",
    skillNames: ["old-figma-skill"],
  });
  await writePluginVersion(pluginCache, "openai-curated", "figma", "2.0.14", {
    manifestName: "figma",
    skillNames: ["figma-use", "figma-code-connect"],
  });
  await mkdir(
    join(pluginCache, "openai-curated", QUARANTINE_SENTINEL),
    { recursive: true },
  );
  const linkedPluginSkill = join(
    pluginCache,
    "openai-curated",
    "figma",
    "2.0.14",
    "skills",
    "linked-entrypoint",
  );
  await mkdir(linkedPluginSkill, { recursive: true });
  await symlink(
    join(externalSkill, "SKILL.md"),
    join(linkedPluginSkill, "SKILL.md"),
  );

  const inventory = await inventoryCapabilities({
    homeDirectory: fixture,
    codexHome,
    agentsHome,
    skillRoots: [
      {
        id: "codex-user-skills",
        path: userSkills,
        scope: "user",
        readFrontmatter: true,
      },
      {
        id: "codex-system-skills",
        path: systemSkills,
        scope: "system",
        readFrontmatter: true,
      },
      {
        id: "agent-global-index",
        path: globalIndex,
        scope: "global-index",
      },
    ],
    pluginCacheRoots: [{ id: "fixture-cache", path: pluginCache }],
    quarantineFamilies: [QUARANTINE_SENTINEL],
  });

  assert.deepEqual(
    inventory.skills.map(({ id, family, source }) => ({ id, family, source })),
    [
      { id: "agent-browser", family: "agent-browser", source: "directory" },
      { id: "gsap-core", family: "gsap", source: "directory" },
      { id: "implement", family: "implement", source: "symlink" },
      { id: "openai-docs", family: "openai-docs", source: "directory" },
    ],
  );
  assert.equal(
    inventory.skills.find(({ id }) => id === "agent-browser").description,
    "Browser automation without leaking skill body content.",
  );
  const linkedGlobalSkill = inventory.skills.find(({ id }) => id === "implement");
  assert.equal(
    linkedGlobalSkill.path,
    join(globalIndex, "implement", "SKILL.md"),
  );
  assert.equal(
    linkedGlobalSkill.targetPath,
    join(externalSkill, "SKILL.md"),
  );
  assert.equal(
    Object.hasOwn(
      inventory.skills.find(({ id }) => id === "agent-browser"),
      "targetPath",
    ),
    false,
  );
  assert.equal(inventory.skills.some(({ id }) => id === "local-only"), false);

  assert.equal(inventory.plugins.length, 1);
  assert.deepEqual(
    {
      id: inventory.plugins[0].id,
      currentVersion: inventory.plugins[0].currentVersion,
      versions: inventory.plugins[0].versions,
      manifestName: inventory.plugins[0].manifestName,
      source: inventory.plugins[0].source,
      cacheRootId: inventory.plugins[0].cacheRootId,
      skillNames: inventory.plugins[0].skillPaths.map((path) =>
        path.split("/").at(-2),
      ),
      allSkillPaths: inventory.plugins[0].allSkillPaths,
    },
    {
      id: "figma@openai-curated",
      currentVersion: "2.0.14",
      versions: ["1.9.0", "2.0.14"],
      manifestName: "figma",
      source: "cache-candidate",
      cacheRootId: "fixture-cache",
      skillNames: ["figma-code-connect", "figma-use"],
      allSkillPaths: [
        join(
          pluginCache,
          "openai-curated",
          "figma",
          "1.9.0",
          "skills",
          "old-figma-skill",
          "SKILL.md",
        ),
        join(
          pluginCache,
          "openai-curated",
          "figma",
          "2.0.14",
          "skills",
          "figma-code-connect",
          "SKILL.md",
        ),
        join(
          pluginCache,
          "openai-curated",
          "figma",
          "2.0.14",
          "skills",
          "figma-use",
          "SKILL.md",
        ),
      ],
    },
  );
  assert.equal(
    inventory.plugins[0].skillPaths.some((path) => path.includes("1.9.0")),
    false,
  );
  const quarantinedPlugin = inventory.hardQuarantine.find(
    ({ kind }) => kind === "plugin",
  );
  assert.deepEqual(
    { id: quarantinedPlugin.id, evidence: quarantinedPlugin.evidence },
    {
      id: `${QUARANTINE_SENTINEL}@openai-curated`,
      evidence: "directory-name",
    },
  );
  const quarantinedSkill = inventory.hardQuarantine.find(
    ({ kind }) => kind === "skill",
  );
  assert.deepEqual(
    {
      id: quarantinedSkill.id,
      evidence: quarantinedSkill.evidence,
      path: quarantinedSkill.path,
    },
    {
      id: QUARANTINE_SENTINEL,
      evidence: "directory-name",
      path: join(userSkills, QUARANTINE_SENTINEL, "SKILL.md"),
    },
  );

  const profiles = await loadCapabilityProfiles();
  assert.deepEqual(Object.keys(profiles.profiles), [
    "minimal",
    "lean",
    "design",
    "web-qa",
    "comms",
    "full",
  ]);
  const lean = getCapabilityProfile(profiles, "lean");
  assert.deepEqual(profiles.hardQuarantine.pluginIds, [
    "superpowers@openai-curated",
  ]);
  assert.deepEqual(lean.plugins.enable, ["github@openai-curated"]);
  assert.deepEqual(lean.skills.disable, ["agent-browser"]);
  assert.deepEqual(lean.skills.disableFamilies, ["gsap"]);
  assert.deepEqual(lean.mcps.disable, [
    "agent_browser",
    "context7",
    "figma",
    "github",
  ]);
  assert.deepEqual(lean.apps.enable, ["github"]);
  assert.equal(lean.skills.preserveScopes.includes("project-local"), true);
  assert.equal(lean.apps.mode, "report-only");
  const quarantinedPluginId = profiles.hardQuarantine.pluginIds[0];
  assert.equal(isHardQuarantined(quarantinedPluginId), true);
  assert.equal(
    isHardQuarantined(QUARANTINE_SENTINEL, [QUARANTINE_SENTINEL]),
    true,
  );

  const invalidProfiles = structuredClone(profiles);
  invalidProfiles.profiles.lean.plugins.enable.push(quarantinedPluginId);
  assert.throws(
    () => getCapabilityProfile(invalidProfiles, "lean"),
    /cannot enable hard-quarantined capability/,
  );
  const extensibleQuarantineProfiles = structuredClone(profiles);
  extensibleQuarantineProfiles.hardQuarantine.families.push(
    QUARANTINE_SENTINEL,
  );
  assert.throws(
    () => getCapabilityProfile(extensibleQuarantineProfiles, "lean"),
    /must use the fixed hard-quarantine families/,
  );
  const unknownKeyProfiles = structuredClone(profiles);
  unknownKeyProfiles.profiles.lean.skills.futurePolicy = [];
  assert.throws(
    () => getCapabilityProfile(unknownKeyProfiles, "lean"),
    /skills has unknown keys: futurePolicy/,
  );
  const conflictingFamilyProfiles = structuredClone(profiles);
  conflictingFamilyProfiles.profiles.lean.skills.enableFamilies.push("gsap");
  assert.throws(
    () => getCapabilityProfile(conflictingFamilyProfiles, "lean"),
    /both enables and disables skill families: gsap/,
  );
  const extraProfileDocument = structuredClone(profiles);
  extraProfileDocument.profiles.experimental = structuredClone(
    profiles.profiles.lean,
  );
  assert.throws(
    () => getCapabilityProfile(extraProfileDocument, "lean"),
    /Unknown capability profiles: experimental/,
  );

  const hiddenProfileParent = join(
    fixture,
    `${QUARANTINE_SENTINEL}-profiles`,
  );
  const safeProfileAlias = join(fixture, "safe-profile-alias");
  await mkdir(hiddenProfileParent, { recursive: true });
  await writeFile(
    join(hiddenProfileParent, "profiles.json"),
    JSON.stringify(profiles),
  );
  await symlink(hiddenProfileParent, safeProfileAlias);
  await assert.rejects(
    () => loadCapabilityProfiles(join(safeProfileAlias, "profiles.json")),
    /Capability profiles path must not be a symlink/,
  );

  const plainSkillRoot = join(fixture, "plain-skill-root");
  const linkedSkillRoot = join(fixture, "linked-skill-root");
  await mkdir(plainSkillRoot, { recursive: true });
  await symlink(plainSkillRoot, linkedSkillRoot);
  await assert.rejects(
    () =>
      inventoryCapabilities({
        skillRoots: [
          {
            id: "linked-skill-root",
            path: linkedSkillRoot,
            scope: "user",
          },
        ],
        pluginCacheRoots: [],
        quarantineFamilies: [QUARANTINE_SENTINEL],
      }),
    /Configured skill root 'linked-skill-root' must not be a symlink/,
  );

  const linkedCacheRoot = join(fixture, "linked-cache-root");
  await symlink(pluginCache, linkedCacheRoot);
  await assert.rejects(
    () =>
      inventoryCapabilities({
        skillRoots: [],
        pluginCacheRoots: [{ id: "linked-cache", path: linkedCacheRoot }],
        quarantineFamilies: [QUARANTINE_SENTINEL],
      }),
    /Configured plugin cache root 'linked-cache' must not be a symlink/,
  );

  const hiddenCacheParent = join(fixture, `${QUARANTINE_SENTINEL}-parent`);
  const safeCacheAlias = join(fixture, "safe-cache-alias");
  await writePluginVersion(
    join(hiddenCacheParent, "cache"),
    "vendor",
    "sample",
    "1.0.0",
    { manifestName: "sample", skillNames: [] },
  );
  await symlink(hiddenCacheParent, safeCacheAlias);
  await assert.rejects(
    () => inventoryPluginsOnly(join(safeCacheAlias, "cache")),
    /Configured plugin cache root 'fixture-cache' must not be a symlink/,
  );

  const marketplaceLinkCache = join(fixture, "marketplace-link-cache");
  await mkdir(marketplaceLinkCache, { recursive: true });
  await symlink(
    join(pluginCache, "openai-curated"),
    join(marketplaceLinkCache, "linked-marketplace"),
  );
  await assert.rejects(
    () => inventoryPluginsOnly(marketplaceLinkCache),
    /Plugin marketplace 'linked-marketplace' must not be a symlink/,
  );

  const skillsLinkCache = join(fixture, "skills-link-cache");
  await writePluginVersion(skillsLinkCache, "vendor", "sample", "1.0.0", {
    manifestName: "sample",
    skillNames: [],
  });
  const externalSkills = join(fixture, "external-plugin-skills");
  await mkdir(externalSkills, { recursive: true });
  await symlink(
    externalSkills,
    join(skillsLinkCache, "vendor", "sample", "1.0.0", "skills"),
  );
  await assert.rejects(
    () => inventoryPluginsOnly(skillsLinkCache),
    /Plugin skills directory .* must not be a symlink/,
  );

  const metadataLinkCache = join(fixture, "metadata-link-cache");
  await writePluginVersion(metadataLinkCache, "vendor", "sample", "1.0.0", {
    manifestName: "sample",
    skillNames: [],
  });
  const metadataPath = join(
    metadataLinkCache,
    "vendor",
    "sample",
    "1.0.0",
    ".codex-plugin",
  );
  const externalMetadata = join(fixture, "external-plugin-metadata");
  await rm(metadataPath, { recursive: true });
  await mkdir(externalMetadata, { recursive: true });
  await writeFile(
    join(externalMetadata, "plugin.json"),
    JSON.stringify({ name: "must-not-be-read" }),
  );
  await symlink(externalMetadata, metadataPath);
  await assert.rejects(
    () => inventoryPluginsOnly(metadataLinkCache),
    /Plugin manifest parent .* must not be a symlink/,
  );

  await assert.rejects(
    () =>
      inventoryCapabilities({
        skillRoots: [
          {
            id: "project-skills",
            path: join(fixture, "project", ".agents", "skills"),
            scope: "project-local",
          },
        ],
        pluginCacheRoots: [],
      }),
    /Project-local roots are never globally inventoried/,
  );

  function inventoryPluginsOnly(cachePath) {
    return inventoryCapabilities({
      skillRoots: [],
      pluginCacheRoots: [{ id: "fixture-cache", path: cachePath }],
      quarantineFamilies: [QUARANTINE_SENTINEL],
    });
  }
});

async function writeSkill(path, { name, description }) {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      ...(description ? [`description: ${description}`] : []),
      "---",
      "",
      "# Fixture",
      "",
    ].join("\n"),
  );
}

async function writePluginVersion(
  cache,
  marketplace,
  family,
  version,
  { manifestName, skillNames },
) {
  const versionPath = join(cache, marketplace, family, version);
  await mkdir(join(versionPath, ".codex-plugin"), { recursive: true });
  await writeFile(
    join(versionPath, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: manifestName }),
  );
  for (const skillName of skillNames) {
    await writeSkill(join(versionPath, "skills", skillName), { name: skillName });
  }
}
