import assert from "node:assert/strict";
import test from "node:test";

const surface = async (path) => Object.keys(await import(path));

const cases = [
  {
    module: "../../scripts/lib/catalog/catalog-toml.mjs",
    present: ["parseDocument", "parseHeader", "parseAssignment", "directAssignments", "splitLines"],
    absent: ["looksLikeManagedOwner", "ambiguousManagedHeader", "looksLikeManagedRootAssignment", "parseAssignmentKey"],
  },
  {
    module: "../../scripts/lib/catalog/catalog-document.mjs",
    present: ["applyOperations", "setEnabled", "removeBlock", "parseSkillPath", "MCP_SERVER_KEYS"],
    absent: ["assertManagedBlock", "insertionAtBlockEnd", "replaceEnabledOperation", "deletionOperation"],
  },
  {
    module: "../../scripts/lib/catalog/catalog-desired.mjs",
    present: ["normalizeDesired", "normalizeFamilies", "pluginIdFromCachedSkillPath"],
    absent: ["normalizeStateRecord", "normalizePluginFamilies", "derivePluginOwners", "normalizePluginSkillAliases", "isTrustedPluginSkill"],
  },
  {
    module: "../../scripts/lib/catalog/catalog-inventory-roots.mjs",
    present: ["resolveInventoryRoots"],
    absent: ["ALLOWED_ROOT_SCOPES"],
  },
  {
    module: "../../scripts/lib/catalog/catalog-inventory.mjs",
    present: ["inventoryCapabilities", "loadCapabilityProfiles", "getCapabilityProfile", "HARD_QUARANTINE_FAMILIES"],
    absent: ["DEFAULT_PROFILES_PATH"],
  },
  {
    module: "../../scripts/lib/install/install-release.mjs",
    present: ["applyInstall", "createInstallPlan", "inspectInstall", "classifyTarget", "declaredRuntimePaths"],
    absent: ["resolveSource", "digestTree"],
  },
  {
    module: "../../scripts/lib/install/skills-export.mjs",
    present: [],
    absent: ["defaultUpstreamPath"],
  },
  {
    module: "../../scripts/lib/lessons/lessons.mjs",
    present: [],
    absent: ["LESSON_BUDGET"],
  },
  {
    module: "../../scripts/lib/support/git-cli.mjs",
    present: ["runGit", "gitText", "gitAvailable", "commitChangedFiles"],
    absent: [],
  },
  {
    module: "../../scripts/lib/state/spine-runs.mjs",
    present: ["runDirectories", "capsuleIds"],
    absent: [],
    exact: ["capsuleIds", "capsuleIdsDetailed", "capsuleStoreReport", "runDirectories", "runDirectoriesDetailed"],
  },
  {
    module: "../../scripts/lib/contract/runtime-closure.mjs",
    present: ["runtimeClosureErrors"],
    absent: ["runtimeClosure"],
  },
  {
    module: "../../scripts/lib/rules/skill-rules.mjs",
    present: ["openaiYamlErrors", "skillContentErrors", "skillPointerErrors", "lineLimitErrors", "skillLayoutErrors", "skillIdentityErrors", "referenceLinkErrors", "skillPromotionErrors"],
    absent: [],
  },
  {
    module: "../../scripts/lib/catalog/catalog-profile.mjs",
    present: ["resolveProfile"],
    absent: [],
  },
  {
    module: "../../scripts/lib/catalog/catalog-config.mjs",
    present: ["loadCatalogConfigPlan", "applyCatalogConfigPlan"],
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

test("modules with an exact surface export nothing else", async () => {
  for (const { module, exact } of cases.filter((entry) => entry.exact)) {
    const keys = await surface(module);
    assert.deepEqual([...keys].sort(), [...exact].sort(), `${module} exports changed`);
  }
});
