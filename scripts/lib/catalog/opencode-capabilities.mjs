import os from "node:os";
import path from "node:path";
import { gitTopLevel } from "../kernel/git.mjs";
import { walkFiles } from "../kernel/walk.mjs";
import { skillMetadata } from "../install/skill-metadata.mjs";
import { loadSkillAdmission } from "./capability-admission.mjs";
import { inventoryCapabilities, loadCapabilityProfiles, getCapabilityProfile } from "./catalog-inventory.mjs";
import { assertAllowedPath, resolveTargetFile } from "./catalog-inventory-paths.mjs";
import { createQuarantineCollector } from "./catalog-inventory-records.mjs";
import { requireDirectoryWithoutSymlinks } from "./catalog-path-safety.mjs";
import { resolveProfile } from "./catalog-profile.mjs";

// OpenCode permissions select names, not filesystem owners. A repository's
// own names keep its existing permissions; native system defaults stay native.
export function skillPermissionProjection({ profile, inventory, admission, codexHome, projectNames = [], existing = {} }) {
  const resolved = resolveProfile(profile, inventory, {}, {}, admission, { codexHome });
  const project = new Set(projectNames);
  const states = new Map();
  for (const skill of inventory.skills) {
    if (project.has(skill.id)) continue;
    const enabled = resolved.desired.skills[skill.path];
    if (enabled !== undefined) states.set(skill.id, states.get(skill.id) === true || enabled);
  }
  const permission = Object.fromEntries(Object.entries(existing).filter(([name]) => !states.has(name)));
  for (const [name, enabled] of states) permission[name] = enabled ? "allow" : "deny";
  return permission;
}

async function projectSkillNames(directory) {
  const boundary = gitTopLevel(directory) || path.resolve(directory);
  const names = new Set();
  const quarantine = createQuarantineCollector([], []);
  let current = path.resolve(directory);
  for (;;) {
    for (const relative of [".agents/skills", ".claude/skills", ".opencode/skills", ".opencode/skill"]) {
      const root = path.join(current, relative);
      if (!await requireDirectoryWithoutSymlinks(root, { allowMissing: true, beforeAccess: assertAllowedPath })) continue;
      for (const entry of walkFiles(root, { beforeAccess: assertAllowedPath, onError: "throw", filter: (entry) => path.basename(entry.path) === "SKILL.md" })) {
        const resolved = await resolveTargetFile(entry.path, quarantine);
        if (!resolved.file) continue;
        const name = skillMetadata(resolved.file)?.name;
        if (name) { assertAllowedPath(name); names.add(name); }
      }
    }
    if (current === boundary || path.dirname(current) === current) break;
    current = path.dirname(current);
  }
  return [...names];
}

export async function configureOpenCodeCapabilities(config, { directory = process.cwd(), homeDirectory = os.homedir(), codexHome = process.env.CODEX_HOME || path.join(homeDirectory, ".codex"), profileName = process.env.KRN_CAPABILITY_PROFILE || "lean" } = {}) {
  const profile = getCapabilityProfile(await loadCapabilityProfiles(), profileName);
  const roots = [["agents", ".agents/skills", "global-index"], ["claude", ".claude/skills", "vendor-global"], ["opencode-home", ".opencode/skills", "vendor-global"], ["opencode-home-singular", ".opencode/skill", "vendor-global"]]
    .map(([id, relative, scope]) => ({ id, path: path.join(homeDirectory, relative), scope }));
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  for (const name of ["skill", "skills"]) roots.push({ id: `opencode-${name}`, path: path.join(configHome, "opencode", name), scope: "vendor-global" });
  const inventory = await inventoryCapabilities({ homeDirectory, skillRoots: roots, pluginCacheRoots: [] });
  const native = config.permission?.skill;
  if (native !== undefined && typeof native !== "string" && (typeof native !== "object" || native === null || Array.isArray(native))) throw new Error("OpenCode skill permissions must be a name map or native scalar");
  if (typeof native === "string" && !["allow", "ask", "deny"].includes(native)) throw new Error("invalid OpenCode skill permission");
  const existing = typeof native === "string" ? { "*": native } : native;
  const permission = skillPermissionProjection({ profile, inventory, admission: loadSkillAdmission(), codexHome, projectNames: await projectSkillNames(directory), existing });
  config.permission = { ...config.permission, skill: permission };
  return { profile: profileName, allowed: Object.entries(permission).filter(([, value]) => value === "allow").map(([name]) => name), denied: Object.entries(permission).filter(([, value]) => value === "deny").map(([name]) => name) };
}
