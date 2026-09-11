import { constants } from "node:fs";
import { open, readdir, readlink, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HARD_QUARANTINE_FAMILIES,
  getCapabilityProfile,
  isHardQuarantined,
  validateProfilesDocument,
} from "./catalog-profiles.mjs";
import { resolveInventoryRoots } from "./catalog-inventory-roots.mjs";
import {
  compareInventoryRecords,
  createQuarantineCollector,
} from "./catalog-inventory-quarantine.mjs";
import { parseSkillFrontmatter, validSkillName } from "./catalog-inventory-frontmatter.mjs";
import {
  requireDirectoryWithoutSymlinks,
  requireRegularFileWithoutSymlinks,
} from "./catalog-path-safety.mjs";

export {
  HARD_QUARANTINE_FAMILIES,
  getCapabilityProfile,
  isHardQuarantined,
} from "./catalog-profiles.mjs";

const DEFAULT_PROFILES_PATH = fileURLToPath(
  new URL("../../config/capability-profiles.json", import.meta.url),
);

const versionCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

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

export async function inventoryCapabilities(options = {}) {
  const homeDirectory = options.homeDirectory ?? homedir();
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(homeDirectory, ".codex");
  const agentsHome =
    options.agentsHome ?? process.env.AGENTS_HOME ?? join(homeDirectory, ".agents");
  const { skillRoots, pluginCacheRoots } = resolveInventoryRoots({
    skillRoots: options.skillRoots,
    pluginCacheRoots: options.pluginCacheRoots,
    codexHome,
    agentsHome,
  });
  const quarantine = createQuarantineCollector(
    options.quarantineEvidence ?? [],
    options.quarantineFamilies ?? [],
  );

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
          manifest.name,
          "manifest-name",
          root.id,
          resolve(currentPath),
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
    return parseSkillFrontmatter(buffer.subarray(0, bytesRead).toString("utf8"));
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
