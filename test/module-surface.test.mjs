import assert from "node:assert/strict";
import test from "node:test";

const surface = async (path) => Object.keys(await import(path));

const cases = [
  {
    module: "../scripts/lib/catalog-toml.mjs",
    present: ["parseDocument", "parseHeader", "parseAssignment", "directAssignments", "splitLines"],
    absent: ["looksLikeManagedOwner", "ambiguousManagedHeader", "looksLikeManagedRootAssignment", "parseAssignmentKey"],
  },
  {
    module: "../scripts/lib/catalog-document.mjs",
    present: ["applyOperations", "setEnabled", "removeBlock", "parseSkillPath", "MCP_SERVER_KEYS"],
    absent: ["assertManagedBlock", "insertionAtBlockEnd", "replaceEnabledOperation", "deletionOperation"],
  },
  {
    module: "../scripts/lib/catalog-desired.mjs",
    present: ["normalizeDesired", "normalizeFamilies", "pluginIdFromCachedSkillPath"],
    absent: ["normalizeStateRecord", "normalizePluginFamilies", "derivePluginOwners", "normalizePluginSkillAliases", "isTrustedPluginSkill"],
  },
  {
    module: "../scripts/lib/catalog-inventory-roots.mjs",
    present: ["resolveInventoryRoots"],
    absent: ["ALLOWED_ROOT_SCOPES"],
  },
  {
    module: "../scripts/lib/catalog-inventory.mjs",
    present: ["inventoryCapabilities", "loadCapabilityProfiles", "getCapabilityProfile", "HARD_QUARANTINE_FAMILIES"],
    absent: ["DEFAULT_PROFILES_PATH"],
  },
  {
    module: "../scripts/lib/install-release.mjs",
    present: ["applyInstall", "createInstallPlan", "inspectInstall", "classifyTarget", "declaredRuntimePaths", "installExitCodes"],
    absent: ["resolveSource", "digestTree"],
  },
  {
    module: "../scripts/lib/skills-export.mjs",
    present: [],
    absent: ["defaultUpstreamPath"],
  },
  {
    module: "../scripts/lib/lessons.mjs",
    present: [],
    absent: ["LESSON_BUDGET"],
  },
  {
    module: "../scripts/lib/git-cli.mjs",
    present: ["runGit", "gitText", "gitAvailable"],
    absent: [],
  },
  {
    module: "../scripts/lib/skill-rules.mjs",
    present: ["openaiYamlErrors", "skillContentErrors", "skillPointerErrors", "lineLimitErrors", "skillLayoutErrors", "skillIdentityErrors", "referenceLinkErrors"],
    absent: [],
  },
];

test("module surfaces expose only the intended interface", async () => {
  for (const { module, present, absent } of cases) {
    const keys = await surface(module);
    for (const name of present) {
      assert.ok(keys.includes(name), `${module} should export ${name}`);
    }
    for (const name of absent) {
      assert.ok(!keys.includes(name), `${module} must not export internal ${name}`);
    }
  }
});
