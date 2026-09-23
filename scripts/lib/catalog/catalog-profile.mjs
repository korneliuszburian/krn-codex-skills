import fs from "node:fs";
import path from "node:path";
import { pluginFamilyFromId } from "./plugin-identity.mjs";
import { hasPinnedUpstreamOrigin } from "./capability-admission.mjs";

function selectorMatches(record, selectors = []) {
  return selectors.some((selector) =>
    [record.id, record.name, record.manifestName, record.family].includes(selector),
  );
}

function familyMatches(record, families = []) {
  return families.includes(record.family);
}

function admittedOwnerMatches(skill, admission, codexHome) {
  if (skill.scope !== "global-index") return false;
  const owner = admission.owners?.[skill.id];
  if (!owner) return true;
  if (owner.origin !== "krn") return hasPinnedUpstreamOrigin(skill.targetPath, owner);
  if (typeof skill.targetPath !== "string" || typeof codexHome !== "string") return false;
  const relative = owner.path.endsWith("/SKILL.md") ? owner.path : `${owner.path}/SKILL.md`;
  try {
    return fs.realpathSync(skill.targetPath) === fs.realpathSync(path.join(codexHome, "krn", "current", relative));
  } catch {
    return false;
  }
}

function assignDesired(target, key, enabled, reason) {
  if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") {
    throw new Error(`invalid profile selector: ${String(key)} (${reason})`);
  }
  if (Object.hasOwn(target, key) && target[key] !== enabled) {
    throw new Error(
      `profile conflict for ${key}: both enabled and disabled (${reason})`,
    );
  }
  target[key] = enabled;
}

export function resolveProfile(
  profile,
  inventory,
  hardQuarantine = {},
  pluginSkillAliases = {},
  admission = { names: [] },
  { codexHome } = {},
) {
  const desired = {
    plugins: {},
    pluginFamilies: {},
    mcpServers: {},
    skills: {},
  };
  const unresolved = { plugins: [], skills: [] };
  const defaults = Object.fromEntries([["plugins", profile.plugins?.default], ["mcpServers", profile.mcps?.default]].filter(([, value]) => value !== undefined));
  if (Object.keys(defaults).length) desired.defaults = defaults;
  const admitted = new Set(admission.names);
  const available = new Set();

  for (const selector of profile.plugins?.enable || []) {
    // Resolve a name/family/manifest selector to the real plugin id(s), mirroring
    // the disable path: planning matches ids, and a bare selector would otherwise
    // fail as an invalid enabled plugin ID.
    const matched = inventory.plugins.filter((plugin) => selectorMatches(plugin, [selector]));
    if (matched.length === 0) {
      assignDesired(desired.plugins, selector, true, "plugins.enable");
      continue;
    }
    for (const plugin of matched) {
      assignDesired(desired.plugins, plugin.id, true, "plugins.enable");
    }
  }
  for (const selector of profile.plugins?.disable || []) {
    // Resolve a name/family selector to the real plugin id(s), so the disable
    // tombstone is keyed by id (planning matches ids) even when the profile uses
    // a family or manifest name.
    const matched = inventory.plugins.filter((plugin) => selectorMatches(plugin, [selector]));
    if (matched.length === 0) {
      assignDesired(desired.plugins, selector, false, "plugins.disable");
      continue;
    }
    for (const plugin of matched) {
      assignDesired(desired.plugins, plugin.id, false, "plugins.disable");
    }
  }
  for (const family of profile.plugins?.disableFamilies || []) {
    assignDesired(
      desired.pluginFamilies,
      family,
      false,
      "plugins.disableFamilies",
    );
  }
  for (const plugin of inventory.plugins) {
    if (familyMatches(plugin, profile.plugins?.disableFamilies)) {
      assignDesired(desired.plugins, plugin.id, false, "plugins.disableFamilies");
    }
    if (profile.plugins?.default === "disabled" && !Object.hasOwn(desired.plugins, plugin.id)) {
      assignDesired(desired.plugins, plugin.id, false, "plugins default");
    }
  }

  const exactPluginSelectors = new Set([
    ...(profile.plugins?.enable || []),
    ...(profile.plugins?.disable || []),
  ]);
  for (const selector of exactPluginSelectors) {
    if (!inventory.plugins.some((plugin) => selectorMatches(plugin, [selector]))) {
      unresolved.plugins.push(selector);
    }
  }

  const preservedScopes = new Set(profile.skills?.preserveScopes || []);
  const exactSkillSelectors = new Set([
    ...(profile.skills?.enable || []),
    ...(profile.skills?.disable || []),
  ]);
  for (const skill of inventory.skills) {
    if (preservedScopes.has(skill.scope)) continue;
    const owningCandidate = admitted.has(skill.id) && admittedOwnerMatches(skill, admission, codexHome);
    if (owningCandidate) available.add(skill.id);
    const exactEnable = selectorMatches(skill, profile.skills?.enable);
    const exactDisable = selectorMatches(skill, profile.skills?.disable);
    const familyEnable = familyMatches(skill, profile.skills?.enableFamilies);
    const familyDisable = familyMatches(skill, profile.skills?.disableFamilies);

    if (exactEnable || exactDisable) {
      if (exactEnable && exactDisable) {
        throw new Error(
          `profile conflict for skill ${skill.id}: both enabled and disabled`,
        );
      }
      assignDesired(
        desired.skills,
        skill.path,
        exactEnable && (!admitted.has(skill.id) || owningCandidate),
        "skills exact selector",
      );
      continue;
    }
    if (owningCandidate) {
      assignDesired(desired.skills, skill.path, true, "derived workflow owner");
      continue;
    }
    if (familyEnable && familyDisable) {
      throw new Error(`profile conflict for skill family ${skill.family}`);
    }
    if (familyEnable || familyDisable) {
      assignDesired(
        desired.skills,
        skill.path,
        familyEnable,
        `skill family ${skill.family}`,
      );
    } else if (profile.skills?.default === "disabled") {
      assignDesired(desired.skills, skill.path, false, "skills default");
    }
  }

  const missingSkills = [...admitted].filter((name) => !profile.skills?.disable?.includes(name) && !available.has(name)).sort();
  for (const [owner, companions] of Object.entries(admission.companions ?? {})) {
    if (profile.skills?.disable?.includes(owner)) continue;
    for (const companion of companions) {
      if (profile.skills?.disable?.includes(companion)) throw new Error(`profile disables companion ${owner} -> ${companion}`);
    }
  }

  for (const selector of exactSkillSelectors) {
    if (!inventory.skills.some((skill) => selectorMatches(skill, [selector]))) {
      unresolved.skills.push(selector);
    }
  }

  for (const name of profile.mcps?.enable || []) {
    assignDesired(desired.mcpServers, name, true, "mcps.enable");
  }
  for (const name of profile.mcps?.disable || []) {
    assignDesired(desired.mcpServers, name, false, "mcps.disable");
  }

  for (const evidence of inventory.hardQuarantine || []) {
    const pluginId = evidence.configId ?? (typeof evidence.id === "string" && evidence.id.includes("@") ? evidence.id : null);
    if (evidence.kind === "plugin" && pluginId) {
      desired.plugins[pluginId] = false;
    }
    if (evidence.kind === "skill" && evidence.path) {
      desired.skills[evidence.path] = false;
    }
  }
  for (const pluginId of hardQuarantine.pluginIds || []) {
    desired.plugins[pluginId] = false;
  }

  const enabledPluginOwners = new Set(
    Object.entries(desired.plugins)
      .filter(([, enabled]) => enabled)
      .map(([pluginId]) => pluginId),
  );
  const pluginOwners = new Map();
  for (const owner of enabledPluginOwners) {
    const family = pluginFamilyFromId(owner);
    if (family === undefined) {
      throw new Error(`invalid enabled plugin ID: ${owner}`);
    }
    const existingOwner = pluginOwners.get(family);
    if (existingOwner !== undefined && existingOwner !== owner) {
      throw new Error(
        `profile conflict for plugin family ${family}: multiple enabled owners (${existingOwner}, ${owner})`,
      );
    }
    pluginOwners.set(family, owner);
  }
  const enabledPluginFamilies = new Set(pluginOwners.keys());
  const trustedSkillPluginIds = new Set(enabledPluginOwners);
  for (const owner of enabledPluginOwners) {
    for (const alias of pluginSkillAliases[owner] || []) {
      trustedSkillPluginIds.add(alias);
    }
  }

  for (const plugin of inventory.plugins) {
    const familyOwned = enabledPluginFamilies.has(plugin.family);
    const ownerEnabled = enabledPluginOwners.has(plugin.id);
    const trustedSkillSource = trustedSkillPluginIds.has(plugin.id);
    if (familyOwned && !ownerEnabled) {
      assignDesired(
        desired.plugins,
        plugin.id,
        false,
        `unowned plugin sibling of ${plugin.family}`,
      );
    }
    const familyDisabled =
      desired.plugins[plugin.id] === false ||
      desired.pluginFamilies[plugin.family] === false ||
      (familyOwned && !trustedSkillSource);
    const skillState = trustedSkillSource
      ? true
      : familyDisabled
        ? false
        : undefined;
    if (skillState === undefined) continue;

    // Codex may back a canonical plugin with skill files under a legacy cache
    // marketplace or a pinned non-latest version. Reconcile every discovered
    // alias/version; the cache's highest version is not installation proof.
    const skillPaths = plugin.allSkillPaths?.length
      ? plugin.allSkillPaths
      : plugin.skillPaths || [];
    for (const skillPath of skillPaths) {
      // Exact skill policy and hard quarantine remain stronger than plugin
      // family enablement.
      if (skillState && desired.skills[skillPath] === false) continue;
      assignDesired(
        desired.skills,
        skillPath,
        skillState,
        `${trustedSkillSource ? "trusted" : "disabled"} plugin ${plugin.id}`,
      );
    }
  }

  return {
    desired,
    missingSkills,
    unresolved: {
      plugins: [...new Set(unresolved.plugins)].sort(),
      skills: [...new Set(unresolved.skills)].sort(),
    },
    apps: {
      mode: profile.apps?.mode || "report-only",
      enable: profile.apps?.enable || [],
      disable: profile.apps?.disable || [],
    },
  };
}
