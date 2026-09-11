import { join } from "node:path";

const ALLOWED_ROOT_SCOPES = new Set([
  "global-index",
  "krn-global",
  "system",
  "user",
  "vendor-global",
]);

function defaultSkillRoots({ codexHome, agentsHome }) {
  return [
    {
      id: "codex-user-skills",
      path: join(codexHome, "skills"),
      scope: "user",
      readFrontmatter: false,
    },
    {
      id: "codex-system-skills",
      path: join(codexHome, "skills", ".system"),
      scope: "system",
      readFrontmatter: false,
    },
    {
      id: "agent-global-index",
      path: join(agentsHome, "skills"),
      scope: "global-index",
      readFrontmatter: false,
    },
  ];
}

function validateSkillRoots(roots) {
  if (!Array.isArray(roots)) {
    throw new TypeError("skillRoots must be an array");
  }
  for (const root of roots) {
    if (!root || typeof root.id !== "string" || typeof root.path !== "string") {
      throw new TypeError("Each skill root needs string id and path fields");
    }
    if (!ALLOWED_ROOT_SCOPES.has(root.scope)) {
      throw new Error(
        `Skill root '${root.id}' has unsupported scope '${root.scope}'. Project-local roots are never globally inventoried.`,
      );
    }
  }
}

function validateCacheRoots(roots) {
  if (!Array.isArray(roots)) {
    throw new TypeError("pluginCacheRoots must be an array");
  }
  for (const root of roots) {
    if (!root || typeof root.id !== "string" || typeof root.path !== "string") {
      throw new TypeError("Each plugin cache root needs string id and path fields");
    }
  }
}

export function resolveInventoryRoots({
  skillRoots,
  pluginCacheRoots,
  codexHome,
  agentsHome,
} = {}) {
  if (skillRoots !== undefined) validateSkillRoots(skillRoots);
  if (pluginCacheRoots !== undefined) validateCacheRoots(pluginCacheRoots);
  const resolvedSkillRoots = skillRoots ?? defaultSkillRoots({ codexHome, agentsHome });
  const resolvedPluginCacheRoots = pluginCacheRoots ?? [
    {
      id: "codex-plugin-cache",
      path: join(codexHome, "plugins", "cache"),
    },
  ];
  return {
    skillRoots: resolvedSkillRoots,
    pluginCacheRoots: resolvedPluginCacheRoots,
  };
}
