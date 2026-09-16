import { constants, lstatSync, readlinkSync } from "node:fs";
import { open, readdir, readlink, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { isHardQuarantined } from "./catalog-profiles.mjs";
import { requireDirectoryWithoutSymlinks } from "./catalog-path-safety.mjs";

export function absoluteLinkPath(linkPath, target) {
  return target.startsWith("/") ? target : `${dirname(linkPath)}/${target}`;
}

function resolveKernelPath(start, quarantine, maxHops = 64) {
  const source = String(start);
  let trailingSlash = source.length > 1 && source.endsWith("/");
  const parts = source.split("/").filter((segment) => segment !== "");
  const resolved = [];
  let hops = 0;
  while (parts.length > 0) {
    const segment = parts.shift();
    if (segment === ".") continue;
    if (segment === "..") {
      // POSIX: `..` after a non-directory is ENOTDIR, so the popped component
      // must have been a directory. Intermediates are checked below.
      if (resolved.length === 0) return { missing: true };
      resolved.pop();
      continue;
    }
    const candidate = `/${[...resolved, segment].join("/")}`;
    if (quarantine.matches(candidate)) return { quarantined: candidate };
    let stat;
    try {
      stat = lstatSync(candidate);
    } catch {
      return { missing: true };
    }
    if (stat.isSymbolicLink()) {
      if ((hops += 1) > maxHops) return { missing: true };
      let target;
      try {
        target = readlinkSync(candidate);
      } catch {
        return { missing: true };
      }
      if (target.startsWith("/")) resolved.length = 0;
      if (target.length > 1 && target.endsWith("/")) trailingSlash = true;
      parts.unshift(...target.split("/").filter((entry) => entry !== ""));
      continue;
    }
    if (parts.length > 0 && !stat.isDirectory()) return { missing: true };
    resolved.push(segment);
  }
  const finalPath = `/${resolved.join("/")}`;
  if (quarantine.matches(finalPath)) return { quarantined: finalPath };
  const finalStat = lstatSync(finalPath, { throwIfNoEntry: false });
  if (!finalStat || !finalStat.isFile()) return { missing: true };
  // A trailing separator addresses a directory; a file path is unresolvable.
  return trailingSlash ? { missing: true } : { file: finalPath };
}

export async function resolveTargetFile(path, quarantine) {
  return resolveKernelPath(path, quarantine);
}

export function assertAllowedPath(path, quarantine) {
  const matches = quarantine?.matches ?? isHardQuarantined;
  if (matches(path)) {
    throw new Error("Refusing filesystem access to a hard-quarantined family");
  }
}

export async function safeLstat(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function safeReadlink(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await readlink(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EINVAL") return null;
    throw error;
  }
}

export async function readSmallJson(path, maxBytes, quarantine) {
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
    try {
      return JSON.parse(await handle.readFile({ encoding: "utf8" }));
    } catch {
      return undefined;
    }
  } finally {
    await handle.close();
  }
}

export async function readDirectory(path, quarantine) {
  assertAllowedPath(path, quarantine);
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function requirePlainDirectory(
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

// Inventory root resolution (merged from catalog-inventory-roots.mjs).
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
  const resolvedSkillRoots = (skillRoots ?? defaultSkillRoots({ codexHome, agentsHome, opencodeHome }))
    .map((root) => ({ ...root, path: resolve(root.path) }));
  const resolvedPluginCacheRoots = (pluginCacheRoots ?? [
    {
      id: "codex-plugin-cache",
      path: join(codexHome, "plugins", "cache"),
    },
  ]).map((root) => ({ ...root, path: resolve(root.path) }));
  return {
    skillRoots: resolvedSkillRoots,
    pluginCacheRoots: resolvedPluginCacheRoots,
  };
}
