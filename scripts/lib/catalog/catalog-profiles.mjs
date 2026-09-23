import { HARD_QUARANTINE_FAMILIES } from "./catalog-errors.mjs";
import { matchesQuarantined, pluginFamilyFromId } from "./plugin-identity.mjs";

export { HARD_QUARANTINE_FAMILIES } from "./catalog-errors.mjs";

const PROFILE_NAMES = Object.freeze([
  "minimal",
  "lean",
  "design",
  "web-qa",
  "comms",
  "full",
]);
const PROFILE_LIST_KEYS = Object.freeze({
  plugins: ["enable", "disable", "disableFamilies"],
  skills: [
    "enable",
    "enableFamilies",
    "disable",
    "disableFamilies",
    "preserveScopes",
  ],
  mcps: ["enable", "disable"],
  apps: ["enable", "disable"],
});

export function isHardQuarantined(
  value,
  families = HARD_QUARANTINE_FAMILIES,
) {
  return matchesQuarantined(value, families);
}

export function getCapabilityProfile(document, name) {
  validateProfilesDocument(document);
  const profile = Object.hasOwn(document.profiles, name) ? document.profiles[name] : undefined;
  if (!profile) {
    throw new Error(
      `Unknown capability profile '${name}'. Expected one of: ${Object.keys(
        document.profiles,
      ).join(", ")}`,
    );
  }
  return structuredClone(profile);
}

export function validateProfilesDocument(document) {
  if (!document || document.schemaVersion !== 1) {
    throw new Error("Capability profiles require schemaVersion 1");
  }
  assertExactKeys(
    document,
    ["schemaVersion", "hardQuarantine", "pluginSkillAliases", "profiles"],
    "capability profile document",
  );
  if (!Array.isArray(document.hardQuarantine?.families)) {
    throw new Error("Capability profiles require hardQuarantine.families");
  }
  assertExactKeys(
    document.hardQuarantine,
    ["families", "pluginIds"],
    "hardQuarantine",
  );
  if (
    document.hardQuarantine.families.length !==
      HARD_QUARANTINE_FAMILIES.length ||
    document.hardQuarantine.families.some(
      (family, index) => family !== HARD_QUARANTINE_FAMILIES[index],
    )
  ) {
    throw new Error(
      `Capability profiles must use the fixed hard-quarantine families: ${HARD_QUARANTINE_FAMILIES.join(", ")}`,
    );
  }
  if (
    !Array.isArray(document.hardQuarantine.pluginIds) ||
    document.hardQuarantine.pluginIds.some(
      (pluginId) =>
        typeof pluginId !== "string" || !isHardQuarantined(pluginId),
    )
  ) {
    throw new Error(
      "Capability profiles require hardQuarantine.pluginIds to contain only quarantined plugin IDs",
    );
  }
  if (
    new Set(document.hardQuarantine.pluginIds).size !==
    document.hardQuarantine.pluginIds.length
  ) {
    throw new Error("Capability profiles contain duplicate hard-quarantine plugin IDs");
  }
  validatePluginSkillAliases(document.pluginSkillAliases);
  if (!document.profiles || typeof document.profiles !== "object") {
    throw new Error("Capability profiles require a profiles object");
  }

  const profileNames = Object.keys(document.profiles);
  const unexpectedProfiles = profileNames.filter(
    (name) => !PROFILE_NAMES.includes(name),
  );
  if (unexpectedProfiles.length > 0) {
    throw new Error(
      `Unknown capability profiles: ${unexpectedProfiles.join(", ")}`,
    );
  }

  for (const name of PROFILE_NAMES) {
    const profile = document.profiles[name];
    if (!profile || typeof profile.description !== "string") {
      throw new Error(`Capability profile '${name}' is missing`);
    }
    validateProfile(name, profile);
  }
}

function validatePluginSkillAliases(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Capability profiles require pluginSkillAliases");
  }

  const owners = new Set(Object.keys(value));
  const claimedAliases = new Set();
  for (const [owner, aliases] of Object.entries(value)) {
    const family = pluginFamilyFromId(owner);
    if (family === undefined || isHardQuarantined(owner)) {
      throw new Error(`Invalid plugin skill alias owner: ${owner}`);
    }
    if (
      !Array.isArray(aliases) ||
      aliases.length === 0 ||
      aliases.some((alias) => typeof alias !== "string")
    ) {
      throw new Error(`Plugin skill alias owner '${owner}' requires aliases`);
    }
    if (new Set(aliases).size !== aliases.length) {
      throw new Error(`Plugin skill alias owner '${owner}' contains duplicates`);
    }
    for (const alias of aliases) {
      if (
        alias === owner ||
        owners.has(alias) ||
        pluginFamilyFromId(alias) !== family ||
        isHardQuarantined(alias)
      ) {
        throw new Error(`Invalid plugin skill alias '${alias}' for '${owner}'`);
      }
      if (claimedAliases.has(alias)) {
        throw new Error(`Plugin skill alias '${alias}' has multiple owners`);
      }
      claimedAliases.add(alias);
    }
  }
}

function validateProfile(name, profile) {
  assertExactKeys(
    profile,
    ["description", "plugins", "skills", "mcps", "apps"],
    `profile '${name}'`,
  );
  for (const [surface, keys] of Object.entries(PROFILE_LIST_KEYS)) {
    const policy = profile[surface];
    if (!policy || typeof policy !== "object") {
      throw new Error(`Profile '${name}' requires ${surface} policy`);
    }
    assertExactKeys(
      policy,
      surface === "apps" ? [...keys, "mode"] : [...keys, "default"],
      `profile '${name}' ${surface}`,
    );
    if (surface !== "apps" && policy.default !== undefined && policy.default !== "disabled") throw new Error(`Profile '${name}' ${surface}.default must be disabled`);
    for (const key of keys) {
      const values = policy[key];
      if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
        throw new Error(`Profile '${name}' requires ${surface}.${key} as strings`);
      }
      if (new Set(values).size !== values.length) {
        throw new Error(`Profile '${name}' has duplicate ${surface}.${key} entries`);
      }
      if (key.startsWith("enable")) {
        for (const value of values) {
          if (isHardQuarantined(value)) {
            throw new Error(
              `Profile '${name}' cannot enable hard-quarantined capability '${value}'`,
            );
          }
        }
      }
    }
    const directConflict = policy.enable.filter((value) => policy.disable.includes(value));
    if (directConflict.length > 0) {
      throw new Error(
        `Profile '${name}' both enables and disables: ${directConflict.join(", ")}`,
      );
    }
  }

  if (!profile.skills.preserveScopes.includes("project-local")) {
    throw new Error(`Profile '${name}' must preserve project-local skills`);
  }
  if (profile.skills.preserveScopes.some((scope) => !["project-local", "system"].includes(scope))) throw new Error(`Profile '${name}' may preserve only project-local and system scopes`);
  const familyConflict = profile.skills.enableFamilies.filter((family) =>
    profile.skills.disableFamilies.includes(family),
  );
  if (familyConflict.length > 0) {
    throw new Error(
      `Profile '${name}' both enables and disables skill families: ${familyConflict.join(", ")}`,
    );
  }
  const enabledPluginFamilyConflict = profile.plugins.enable
    .map((pluginId) => pluginId.split("@", 1)[0])
    .filter((family) => profile.plugins.disableFamilies.includes(family));
  if (enabledPluginFamilyConflict.length > 0) {
    throw new Error(
      `Profile '${name}' enables plugins from disabled families: ${enabledPluginFamilyConflict.join(", ")}`,
    );
  }
  const enabledSkillFamilyConflict = profile.skills.enable
    .map((skillId) => (skillId.startsWith("gsap-") ? "gsap" : skillId))
    .filter((family) => profile.skills.disableFamilies.includes(family));
  if (enabledSkillFamilyConflict.length > 0) {
    throw new Error(
      `Profile '${name}' enables skills from disabled families: ${enabledSkillFamilyConflict.join(", ")}`,
    );
  }
  if (profile.apps.mode !== "report-only") {
    throw new Error(`Profile '${name}' apps must remain report-only`);
  }
}

function assertExactKeys(value, allowedKeys, label) {
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`${label} has unknown keys: ${unknownKeys.join(", ")}`);
  }
}
