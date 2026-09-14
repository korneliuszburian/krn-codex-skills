import { pluginFamilyFromId } from "./plugin-identity.mjs";

function selectorMatches(record, selectors = []) {
  return selectors.some((selector) =>
    [record.id, record.name, record.family].includes(selector),
  );
}

function familyMatches(record, families = []) {
  return families.includes(record.family);
}

function assignDesired(target, key, enabled, reason) {
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
) {
  const desired = {
    plugins: {},
    pluginFamilies: {},
    mcpServers: {},
    skills: {},
  };
  const unresolved = { plugins: [], skills: [] };

  for (const pluginId of profile.plugins?.enable || []) {
    assignDesired(desired.plugins, pluginId, true, "plugins.enable");
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
    const exactEnable = selectorMatches(skill, profile.skills?.enable);
    const exactDisable = selectorMatches(skill, profile.skills?.disable);
    const familyEnable = familyMatches(skill, profile.skills?.enableFamilies);
    const familyDisable = familyMatches(skill, profile.skills?.disableFamilies);
    const preserved = preservedScopes.has(skill.scope);

    if (exactEnable || exactDisable) {
      if (exactEnable && exactDisable) {
        throw new Error(
          `profile conflict for skill ${skill.id}: both enabled and disabled`,
        );
      }
      assignDesired(
        desired.skills,
        skill.path,
        exactEnable,
        "skills exact selector",
      );
      continue;
    }
    if (preserved) continue;
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
    if (evidence.kind === "plugin" && evidence.id?.includes("@")) {
      desired.plugins[evidence.id] = false;
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
