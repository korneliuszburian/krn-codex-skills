import { constants } from "node:fs";
import { open, readdir, readlink, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireDirectoryWithoutSymlinks,
  requireRegularFileWithoutSymlinks,
} from "./catalog-path-safety.mjs";
import { matchesQuarantined, pluginFamilyFromId } from "./plugin-identity.mjs";

export const DEFAULT_PROFILES_PATH = fileURLToPath(
  new URL("../../config/capability-profiles.json", import.meta.url),
);

export const HARD_QUARANTINE_FAMILIES = Object.freeze(["superpowers"]);

const PROFILE_NAMES = Object.freeze([
  "minimal",
  "lean",
  "engineering-full",
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
const ALLOWED_ROOT_SCOPES = new Set([
  "global-index",
  "krn-global",
  "system",
  "user",
  "vendor-global",
]);
const versionCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function isHardQuarantined(
  value,
  families = HARD_QUARANTINE_FAMILIES,
) {
  return matchesQuarantined(value, families);
}

export async function loadCapabilityProfiles(filePath = DEFAULT_PROFILES_PATH) {
  assertAllowedPath(filePath);
  await requireRegularFileWithoutSymlinks(filePath, {
    label: "Capability profiles path",
    beforeAccess: assertAllowedPath,
  });
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let source;
  try {
    source = await handle.readFile({ encoding: "utf8" });
  } finally {
    await handle.close();
  }
  const document = JSON.parse(source);
  validateProfilesDocument(document);
  return document;
}

export function getCapabilityProfile(document, name) {
  validateProfilesDocument(document);
  const profile = document.profiles[name];
  if (!profile) {
    throw new Error(
      `Unknown capability profile '${name}'. Expected one of: ${Object.keys(
        document.profiles,
      ).join(", ")}`,
    );
  }
  return structuredClone(profile);
}

export async function inventoryCapabilities(options = {}) {
  const homeDirectory = options.homeDirectory ?? homedir();
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(homeDirectory, ".codex");
  const agentsHome =
    options.agentsHome ?? process.env.AGENTS_HOME ?? join(homeDirectory, ".agents");
  const skillRoots =
    options.skillRoots ?? defaultSkillRoots({ codexHome, agentsHome });
  const pluginCacheRoots =
    options.pluginCacheRoots ?? [
      {
        id: "codex-plugin-cache",
        path: join(codexHome, "plugins", "cache"),
      },
    ];
  const quarantine = createQuarantineCollector(
    options.quarantineEvidence ?? [],
    options.quarantineFamilies ?? [],
  );

  validateSkillRoots(skillRoots);
  validateCacheRoots(pluginCacheRoots);

  const skills = [];
  for (const root of skillRoots) {
    await inventorySkillRoot(root, skills, quarantine);
  }

  const plugins = [];
  for (const root of pluginCacheRoots) {
    await inventoryPluginCache(root, plugins, quarantine);
  }

  skills.sort(compareInventoryRecords);
  plugins.sort(compareInventoryRecords);

  return {
    schemaVersion: 1,
    skills,
    plugins,
    hardQuarantine: quarantine.values(),
  };
}

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

async function inventorySkillRoot(root, records, quarantine) {
  if (quarantine.matches(root.path) || quarantine.matches(root.id)) {
    quarantine.add(
      "skill",
      quarantine.familyFor(root.path) ?? root.id,
      "configured-root",
      root.id,
    );
    return;
  }
  const rootExists = await requirePlainDirectory(
    root.path,
    quarantine,
    `Configured skill root '${root.id}'`,
    { allowMissing: true },
  );
  if (!rootExists) return;

  for (const entry of await readDirectory(root.path, quarantine)) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = join(root.path, entry.name);
    if (quarantine.matches(entry.name)) {
      quarantine.add(
        "skill",
        entry.name,
        "directory-name",
        root.id,
        resolve(entryPath, "SKILL.md"),
      );
      continue;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    if (entry.isSymbolicLink()) {
      const target = await safeReadlink(entryPath, quarantine);
      if (target === null) continue;
      const resolvedTarget = resolve(dirname(entryPath), target);
      if (quarantine.matches(target) || quarantine.matches(resolvedTarget)) {
        quarantine.add(
          "skill",
          quarantine.familyFor(resolvedTarget) ?? entry.name,
          "symlink-target",
          root.id,
          resolve(entryPath, "SKILL.md"),
        );
        continue;
      }
      records.push(
        skillRecord({
          name: entry.name,
          description: undefined,
          root,
          source: "symlink",
          path: join(entryPath, "SKILL.md"),
          targetPath: join(resolvedTarget, "SKILL.md"),
        }),
      );
      continue;
    }

    const skillPath = join(entryPath, "SKILL.md");
    const skillFile = await safeLstat(skillPath, quarantine);
    if (!skillFile || (!skillFile.isFile() && !skillFile.isSymbolicLink())) continue;

    if (skillFile.isSymbolicLink()) {
      const target = await safeReadlink(skillPath, quarantine);
      if (target === null) continue;
      const resolvedTarget = resolve(dirname(skillPath), target);
      if (quarantine.matches(target) || quarantine.matches(resolvedTarget)) {
        quarantine.add(
          "skill",
          quarantine.familyFor(resolvedTarget) ?? entry.name,
          "symlink-target",
          root.id,
          resolve(skillPath),
        );
        continue;
      }
    }

    let metadata;
    if (root.readFrontmatter === true && skillFile.isFile()) {
      metadata = await readSkillFrontmatter(skillPath, quarantine);
      if (metadata?.name && quarantine.matches(metadata.name)) {
        quarantine.add(
          "skill",
          metadata.name,
          "frontmatter-name",
          root.id,
          resolve(skillPath),
        );
        continue;
      }
    }

    const name = validSkillName(metadata?.name) ? metadata.name : entry.name;
    records.push(
      skillRecord({
        name,
        description: metadata?.description,
        root,
        source: skillFile.isSymbolicLink() ? "file-symlink" : "directory",
        path: skillPath,
      }),
    );
  }
}

function skillRecord({ name, description, root, source, path, targetPath }) {
  return {
    id: name,
    name,
    family: name.startsWith("gsap-") ? "gsap" : name,
    scope: root.scope,
    rootId: root.id,
    path,
    source,
    ...(targetPath ? { targetPath } : {}),
    ...(description ? { description } : {}),
  };
}

async function inventoryPluginCache(root, records, quarantine) {
  if (quarantine.matches(root.path) || quarantine.matches(root.id)) {
    quarantine.add(
      "plugin",
      quarantine.familyFor(root.path) ?? root.id,
      "configured-root",
      root.id,
    );
    return;
  }
  const rootExists = await requirePlainDirectory(
    root.path,
    quarantine,
    `Configured plugin cache root '${root.id}'`,
    { allowMissing: true },
  );
  if (!rootExists) return;

  for (const marketplaceEntry of await readDirectory(root.path, quarantine)) {
    if (marketplaceEntry.name.startsWith(".")) continue;
    if (quarantine.matches(marketplaceEntry.name)) {
      quarantine.add("plugin", marketplaceEntry.name, "marketplace-name", root.id);
      continue;
    }
    if (marketplaceEntry.isSymbolicLink()) {
      throw new Error(
        `Plugin marketplace '${marketplaceEntry.name}' must not be a symlink`,
      );
    }
    if (!marketplaceEntry.isDirectory()) continue;

    const marketplace = marketplaceEntry.name;
    const marketplacePath = join(root.path, marketplace);
    await requirePlainDirectory(
      marketplacePath,
      quarantine,
      `Plugin marketplace '${marketplace}'`,
    );
    for (const pluginEntry of await readDirectory(marketplacePath, quarantine)) {
      if (pluginEntry.name.startsWith(".")) continue;
      const family = pluginEntry.name;
      if (quarantine.matches(family)) {
        quarantine.add(
          "plugin",
          `${family}@${marketplace}`,
          "directory-name",
          root.id,
        );
        continue;
      }
      if (pluginEntry.isSymbolicLink()) {
        throw new Error(
          `Plugin cache family '${family}@${marketplace}' must not be a symlink`,
        );
      }
      if (!pluginEntry.isDirectory()) continue;

      const pluginPath = join(marketplacePath, family);
      await requirePlainDirectory(
        pluginPath,
        quarantine,
        `Plugin cache family '${family}@${marketplace}'`,
      );
      const versions = [];
      let latestVersion = null;
      for (const versionEntry of await readDirectory(pluginPath, quarantine)) {
        if (versionEntry.name.startsWith(".") || quarantine.matches(versionEntry.name)) {
          continue;
        }
        if (versionEntry.isSymbolicLink()) {
          if (versionEntry.name !== "latest") {
            throw new Error(
              `Plugin cache version '${family}@${marketplace}/${versionEntry.name}' must not be a symlink`,
            );
          }
          const aliasPath = join(pluginPath, versionEntry.name);
          const target = await safeReadlink(aliasPath, quarantine);
          const resolvedTarget = resolve(pluginPath, target ?? "");
          if (dirname(resolvedTarget) !== pluginPath) {
            throw new Error(
              `Plugin cache latest alias '${family}@${marketplace}' must resolve to a sibling version directory`,
            );
          }
          await requirePlainDirectory(
            resolvedTarget,
            quarantine,
            `Plugin cache latest target '${family}@${marketplace}/${basename(resolvedTarget)}'`,
          );
          latestVersion = basename(resolvedTarget);
          continue;
        }
        if (versionEntry.isDirectory()) versions.push(versionEntry.name);
      }
      versions.sort(versionCollator.compare);
      if (versions.length === 0) continue;

      if (latestVersion !== null && !versions.includes(latestVersion)) {
        throw new Error(
          `Plugin cache latest alias '${family}@${marketplace}' must name an inventoried version directory`,
        );
      }
      const currentVersion = latestVersion ?? versions.at(-1);
      const currentPath = join(pluginPath, currentVersion);
      const allSkillPaths = [];
      let skillPaths = [];
      for (const version of versions) {
        const versionPath = join(pluginPath, version);
        await requirePlainDirectory(
          versionPath,
          quarantine,
          `Plugin cache version '${family}@${marketplace}/${version}'`,
        );
        const versionSkillPaths = await pluginSkillPaths(
          versionPath,
          root.id,
          quarantine,
        );
        allSkillPaths.push(...versionSkillPaths);
        if (version === currentVersion) skillPaths = versionSkillPaths;
      }

      const manifest = await readPluginManifest(currentPath, quarantine);
      if (manifest.name && quarantine.matches(manifest.name)) {
        quarantine.add(
          "plugin",
          `${family}@${marketplace}`,
          "manifest-name",
          root.id,
        );
        continue;
      }

      records.push({
        id: `${family}@${marketplace}`,
        family,
        marketplace,
        source: "cache-candidate",
        cacheRootId: root.id,
        currentVersion,
        versions,
        manifestName: manifest.name ?? family,
        path: currentPath,
        skillPaths,
        allSkillPaths: allSkillPaths.sort(),
      });
    }
  }
}

async function readPluginManifest(pluginPath, quarantine) {
  const metadataPath = join(pluginPath, ".codex-plugin");
  const hasMetadataDirectory = await requirePlainDirectory(
    metadataPath,
    quarantine,
    `Plugin manifest parent '${metadataPath}'`,
    { allowMissing: true },
  );
  const candidates = [
    ...(hasMetadataDirectory
      ? [join(metadataPath, "plugin.json")]
      : []),
    join(pluginPath, "plugin.json"),
    join(pluginPath, "manifest.json"),
  ];
  for (const candidate of candidates) {
    const parsed = await readSmallJson(candidate, 64 * 1024, quarantine);
    if (!parsed) continue;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
    };
  }
  return {};
}

async function pluginSkillPaths(pluginPath, sourceId, quarantine) {
  const skillsPath = join(pluginPath, "skills");
  const hasSkillsDirectory = await requirePlainDirectory(
    skillsPath,
    quarantine,
    `Plugin skills directory '${skillsPath}'`,
    { allowMissing: true },
  );
  if (!hasSkillsDirectory) return [];

  const paths = [];
  for (const entry of await readDirectory(skillsPath, quarantine)) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = join(skillsPath, entry.name);
    if (quarantine.matches(entry.name)) {
      quarantine.add(
        "skill",
        entry.name,
        "plugin-skill-name",
        sourceId,
        resolve(entryPath, "SKILL.md"),
      );
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Plugin skill directory '${entryPath}' must not be a symlink`,
      );
    }
    if (!entry.isDirectory()) continue;
    await requirePlainDirectory(
      entryPath,
      quarantine,
      `Plugin skill directory '${entryPath}'`,
    );

    const skillPath = join(entryPath, "SKILL.md");
    const skillFile = await safeLstat(skillPath, quarantine);
    if (skillFile?.isSymbolicLink()) {
      // Cached plugin entrypoints must be regular files. Do not follow links
      // from a third-party cache, even when their lexical target looks safe.
      const target = await safeReadlink(skillPath, quarantine);
      if (target && quarantine.matches(target)) {
        quarantine.add(
          "skill",
          quarantine.familyFor(target) ?? entry.name,
          "symlink-target",
          sourceId,
          resolve(skillPath),
        );
      }
      continue;
    }
    if (skillFile?.isFile()) paths.push(skillPath);
  }
  return paths.sort();
}

async function readSkillFrontmatter(skillPath, quarantine) {
  assertAllowedPath(skillPath, quarantine);
  let handle;
  try {
    handle = await open(
      skillPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") return undefined;
    throw error;
  }
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const prefix = buffer.subarray(0, bytesRead).toString("utf8");
    const lines = prefix.split(/\r?\n/);
    if (lines[0] !== "---") return undefined;

    const metadata = {};
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === "---") break;
      const match = /^(name|description):\s*(.*)$/.exec(line);
      if (!match) continue;
      metadata[match[1]] = sanitizeMetadataValue(match[2]);
    }
    return metadata;
  } finally {
    await handle.close();
  }
}

async function readSmallJson(path, maxBytes, quarantine) {
  assertAllowedPath(path, quarantine);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") return undefined;
    throw error;
  }
  try {
    const file = await handle.stat();
    if (!file.isFile() || file.size > maxBytes) return undefined;
    return JSON.parse(await handle.readFile({ encoding: "utf8" }));
  } finally {
    await handle.close();
  }
}

function sanitizeMetadataValue(value) {
  const unquoted = value.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  return unquoted.replace(/\s+/g, " ").trim().slice(0, 320);
}

function validSkillName(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function createQuarantineCollector(evidence, additionalFamilies) {
  if (
    !Array.isArray(additionalFamilies) ||
    additionalFamilies.some(
      (family) => typeof family !== "string" || family.trim() === "",
    )
  ) {
    throw new TypeError("quarantineFamilies must contain non-empty strings");
  }
  const families = [
    ...new Set([
      ...HARD_QUARANTINE_FAMILIES,
      ...additionalFamilies.map((family) => family.toLowerCase()),
    ]),
  ];
  const matches = (value) => isHardQuarantined(value, families);
  const familyFor = (value) => {
    const candidate = String(value ?? "").toLowerCase();
    return families.find((family) => candidate.includes(family));
  };
  const records = new Map();
  const add = (kind, id, evidenceType, sourceId, lexicalPath) => {
    if (!matches(id) && !matches(lexicalPath)) return;
    const record = {
      kind: sanitizeLabel(kind),
      id: sanitizeLabel(id),
      evidence: sanitizeLabel(evidenceType),
      sourceId: sanitizeLabel(sourceId),
      ...(typeof lexicalPath === "string" ? { path: lexicalPath } : {}),
    };
    records.set(JSON.stringify(record), record);
  };

  for (const item of evidence) {
    if (!item || typeof item.id !== "string") continue;
    add(
      item.kind ?? "unknown",
      item.id,
      item.evidence ?? "supplied-name",
      item.sourceId ?? "supplied",
      item.path,
    );
  }

  return {
    add,
    familyFor,
    matches,
    values: () => [...records.values()].sort(compareInventoryRecords),
  };
}

function sanitizeLabel(value) {
  return String(value ?? "unknown")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function validateProfilesDocument(document) {
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
    ["families", "pluginIds", "reason"],
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
      surface === "apps" ? [...keys, "mode"] : keys,
      `profile '${name}' ${surface}`,
    );
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

async function readDirectory(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function safeLstat(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function safeReadlink(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await readlink(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EINVAL") return null;
    throw error;
  }
}

function assertAllowedPath(path, quarantine) {
  const matches = quarantine?.matches ?? isHardQuarantined;
  if (matches(path)) {
    throw new Error("Refusing filesystem access to a hard-quarantined family");
  }
}

async function requirePlainDirectory(
  path,
  quarantine,
  label,
  { allowMissing = false } = {},
) {
  return requireDirectoryWithoutSymlinks(path, {
    label,
    allowMissing,
    beforeAccess: (candidate) => assertAllowedPath(candidate, quarantine),
  });
}

function compareInventoryRecords(left, right) {
  const leftKey = `${left.kind ?? ""}:${left.id ?? ""}:${left.sourceId ?? ""}`;
  const rightKey = `${right.kind ?? ""}:${right.id ?? ""}:${right.sourceId ?? ""}`;
  return leftKey.localeCompare(rightKey);
}
