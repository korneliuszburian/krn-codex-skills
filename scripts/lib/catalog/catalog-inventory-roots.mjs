import { dirname, join } from "node:path";
import { homedir } from "node:os";

const ALLOWED_ROOT_SCOPES = new Set([
  "global-index",
  "krn-global",
  "system",
  "user",
  "vendor-global",
]);

function defaultSkillRoots({ codexHome, agentsHome, opencodeHome }) {
  return [
    {
      id: "codex-user-skills",
      path: join(codexHome, "skills"),
      scope: "user",
    },
    {
      id: "codex-system-skills",
      path: join(codexHome, "skills", ".system"),
      scope: "system",
    },
    {
      id: "agent-global-index",
      path: join(agentsHome, "skills"),
      scope: "global-index",
    },
    {
      id: "opencode-skills",
      path: join(opencodeHome, "skills"),
      scope: "vendor-global",
    },
  ];
}

function validateRootList(roots, arrayMessage, fieldMessage) {
  if (!Array.isArray(roots)) throw new TypeError(arrayMessage);
  for (const root of roots) {
    if (!root || typeof root.id !== "string" || typeof root.path !== "string") {
      throw new TypeError(fieldMessage);
    }
  }
}

function validateSkillRoots(roots) {
  validateRootList(roots, "skillRoots must be an array", "Each skill root needs string id and path fields");
  for (const root of roots) {
    if (!ALLOWED_ROOT_SCOPES.has(root.scope)) {
      throw new Error(
        `Skill root '${root.id}' has unsupported scope '${root.scope}'. Project-local roots are never globally inventoried.`,
      );
    }
  }
}

function validateCacheRoots(roots) {
  validateRootList(roots, "pluginCacheRoots must be an array", "Each plugin cache root needs string id and path fields");
}

export function resolveInventoryRoots({
  skillRoots,
  pluginCacheRoots,
  codexHome,
  agentsHome,
  opencodeHome = join(dirname(agentsHome ?? join(homedir(), ".agents")), ".config", "opencode"),
} = {}) {
  if (skillRoots !== undefined) validateSkillRoots(skillRoots);
  if (pluginCacheRoots !== undefined) validateCacheRoots(pluginCacheRoots);
  const resolvedSkillRoots = skillRoots ?? defaultSkillRoots({ codexHome, agentsHome, opencodeHome });
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
