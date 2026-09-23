import { isAbsolute, normalize } from "node:path";

import { ConfigReconcileError, HARD_QUARANTINE_FAMILIES, QuarantineViolationError } from "./catalog-errors.mjs";
import { matchesQuarantined, pluginFamilyFromId } from "./plugin-identity.mjs";

export function normalizeFamilies(extraFamilies) {
  const families = new Set(HARD_QUARANTINE_FAMILIES);

  if (extraFamilies !== undefined) {
    if (!Array.isArray(extraFamilies)) {
      throw new ConfigReconcileError("quarantineFamilies must be an array");
    }

    for (const family of extraFamilies) {
      if (typeof family !== "string" || family.trim() === "") {
        throw new ConfigReconcileError(
          "quarantineFamilies entries must be non-empty strings",
        );
      }
      families.add(family.trim().toLowerCase());
    }
  }

  return [...families];
}

function normalizeStateRecord(value, label) {
  if (value === undefined) return new Map();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigReconcileError(`${label} must be an object of boolean states`);
  }

  const states = new Map();
  for (const [id, enabled] of Object.entries(value)) {
    if (id.trim() === "") {
      throw new ConfigReconcileError(`${label} contains an empty identifier`);
    }
    if (typeof enabled !== "boolean") {
      throw new ConfigReconcileError(`${label}.${id} must be boolean`);
    }
    states.set(id, enabled);
  }
  return states;
}

function normalizePluginFamilies(value) {
  const families = normalizeStateRecord(value, "desired.pluginFamilies");

  for (const [family, enabled] of families) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(family)) {
      throw new ConfigReconcileError(`Invalid plugin family selector: ${family}`, {
        code: "CONFIG_INVALID_PLUGIN_FAMILY",
        target: family,
      });
    }
    if (enabled) {
      throw new ConfigReconcileError(
        `Plugin families can only be disabled, not enabled: ${family}`,
        {
          code: "CONFIG_PLUGIN_FAMILY_ENABLE_UNSUPPORTED",
          target: family,
        },
      );
    }
  }

  return families;
}

function derivePluginOwners(plugins) {
  const owners = new Map();
  for (const [owner, enabled] of plugins) {
    if (!enabled) continue;
    const family = pluginFamilyFromId(owner);
    if (family === undefined) {
      throw new ConfigReconcileError(`Invalid enabled plugin ID: ${owner}`, {
        code: "CONFIG_INVALID_PLUGIN_OWNER",
        target: owner,
      });
    }
    const existingOwner = owners.get(family);
    if (existingOwner !== undefined && existingOwner !== owner) {
      throw new ConfigReconcileError(
        `Plugin family ${family} has multiple enabled owners: ${existingOwner}, ${owner}`,
        { code: "CONFIG_PLUGIN_OWNER_CONFLICT", target: family },
      );
    }
    owners.set(family, owner);
  }
  return owners;
}

function normalizePluginSkillAliases(value, families) {
  if (value === undefined) return new Map();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigReconcileError(
      "pluginSkillAliases must be an object of owner-to-alias mappings",
      { code: "CONFIG_INVALID_PLUGIN_SKILL_ALIASES" },
    );
  }

  const ownerIds = new Set(Object.keys(value));
  const claimedAliases = new Set();
  const aliasesByOwner = new Map();
  for (const [owner, aliases] of Object.entries(value)) {
    const family = pluginFamilyFromId(owner);
    if (
      family === undefined ||
      matchesQuarantined(owner, families) ||
      !Array.isArray(aliases) ||
      aliases.length === 0
    ) {
      throw new ConfigReconcileError(
        `Invalid plugin skill alias owner: ${owner}`,
        { code: "CONFIG_INVALID_PLUGIN_SKILL_ALIASES", target: owner },
      );
    }

    const normalizedAliases = new Set();
    for (const alias of aliases) {
      if (
        typeof alias !== "string" ||
        alias === owner ||
        ownerIds.has(alias) ||
        pluginFamilyFromId(alias) !== family ||
        matchesQuarantined(alias, families) ||
        normalizedAliases.has(alias) ||
        claimedAliases.has(alias)
      ) {
        throw new ConfigReconcileError(
          `Invalid plugin skill alias '${String(alias)}' for '${owner}'`,
          { code: "CONFIG_INVALID_PLUGIN_SKILL_ALIASES", target: alias },
        );
      }
      normalizedAliases.add(alias);
      claimedAliases.add(alias);
    }
    aliasesByOwner.set(owner, normalizedAliases);
  }
  return aliasesByOwner;
}

function isTrustedPluginSkill(pluginId, pluginOwners, aliasesByOwner) {
  const family = pluginFamilyFromId(pluginId);
  if (family === undefined) return false;
  const owner = pluginOwners.get(family);
  return (
    owner === pluginId ||
    (owner !== undefined && aliasesByOwner.get(owner)?.has(pluginId) === true)
  );
}

export function normalizeDesired(desired, families, pluginSkillAliases) {
  if (desired === null || typeof desired !== "object" || Array.isArray(desired)) {
    throw new ConfigReconcileError("desired must be an object");
  }
  const defaults = desired.defaults ?? {};
  if (defaults === null || typeof defaults !== "object" || Array.isArray(defaults) || Object.entries(defaults).some(([key, value]) => !["plugins", "mcpServers"].includes(key) || value !== "disabled")) {
    throw new ConfigReconcileError("desired.defaults supports only disabled plugins and mcpServers");
  }

  const plugins = normalizeStateRecord(desired.plugins, "desired.plugins");
  const pluginFamilies = normalizePluginFamilies(desired.pluginFamilies);
  const pluginOwners = derivePluginOwners(plugins);
  const aliasesByOwner = normalizePluginSkillAliases(
    pluginSkillAliases,
    families,
  );
  const mcpServers = normalizeStateRecord(
    desired.mcpServers,
    "desired.mcpServers",
  );
  const rawSkills = normalizeStateRecord(desired.skills, "desired.skills");
  const skills = new Map();

  for (const states of [plugins, mcpServers]) {
    for (const [id, enabled] of states) {
      if (enabled && matchesQuarantined(id, families)) {
        throw new QuarantineViolationError(id);
      }
    }
  }

  for (const [id, enabled] of plugins) {
    const family = pluginFamilyFromId(id);
    if (enabled && family !== undefined && pluginFamilies.has(family)) {
      throw new ConfigReconcileError(
        `Exact plugin enable conflicts with disabled family ${family}: ${id}`,
        {
          code: "CONFIG_PLUGIN_FAMILY_CONFLICT",
          target: id,
        },
      );
    }
  }

  for (const [rawPath, enabled] of rawSkills) {
    // This is deliberately lexical. Skill paths are never statted, resolved,
    // realpathed, or read by the reconciler.
    const quarantinedBeforeNormalization = matchesQuarantined(rawPath, families);
    if (enabled && quarantinedBeforeNormalization) {
      throw new QuarantineViolationError(rawPath);
    }
    if (!isAbsolute(rawPath)) {
      throw new ConfigReconcileError(
        `desired.skills path must be absolute: ${rawPath}`,
        { target: rawPath },
      );
    }

    const stablePath = normalize(rawPath);
    if (enabled && matchesQuarantined(stablePath, families)) {
      throw new QuarantineViolationError(rawPath);
    }
    if (skills.has(stablePath)) {
      throw new ConfigReconcileError(
        `desired.skills contains duplicate normalized path: ${stablePath}`,
        { target: stablePath },
      );
    }
    skills.set(stablePath, enabled);
  }

  for (const [skillPath, enabled] of skills) {
    if (!enabled) continue;
    const cachedPluginId = pluginIdFromCachedSkillPath(skillPath);
    if (
      cachedPluginId !== undefined &&
      !isTrustedPluginSkill(cachedPluginId, pluginOwners, aliasesByOwner)
    ) {
      throw new ConfigReconcileError(
        `Cannot enable an untrusted plugin cache skill: ${skillPath}`,
        { code: "CONFIG_UNTRUSTED_PLUGIN_SKILL_ENABLE", target: skillPath },
      );
    }
  }

  return {
    defaults,
    plugins,
    pluginOwners,
    pluginFamilies,
    pluginSkillAliases: aliasesByOwner,
    mcpServers,
    skills,
  };
}


export function pluginIdFromCachedSkillPath(skillPath) {
  const slashPath = skillPath.replaceAll("\\", "/");
  const marker = "/plugins/cache/";
  const markerIndex = slashPath.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;

  const segments = slashPath.slice(markerIndex + marker.length).split("/");
  if (
    segments.length < 6 ||
    segments[0] === "" ||
    segments[1] === "" ||
    segments[2] === "" ||
    segments[3] !== "skills" ||
    segments.at(-1) !== "SKILL.md"
  ) {
    return undefined;
  }

  const [marketplace, plugin] = segments;
  return `${plugin}@${marketplace}`;
}
