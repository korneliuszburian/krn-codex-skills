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

export function resolveProfile(profile, inventory, hardQuarantine = {}) {
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
  for (const pluginId of profile.plugins?.disable || []) {
    assignDesired(desired.plugins, pluginId, false, "plugins.disable");
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
