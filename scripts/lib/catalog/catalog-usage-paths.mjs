import path from "node:path";

import { isValidDay } from "./catalog-usage-normalize.mjs";
import { HARD_QUARANTINE_FAMILIES } from "./catalog-errors.mjs";
import { matchesQuarantined } from "./plugin-identity.mjs";

const FORBIDDEN_DIRECTORY_NAMES = new Set([
  "db",
  "database",
  "databases",
  "history",
  "histories",
  "log",
  "logs",
]);

const FORBIDDEN_FILE_NAMES = new Set(["history.jsonl"]);

export function forbiddenName(name) {
  const lower = name.toLowerCase();
  return (
    matchesQuarantined(lower, HARD_QUARANTINE_FAMILIES) ||
    FORBIDDEN_DIRECTORY_NAMES.has(lower) ||
    FORBIDDEN_FILE_NAMES.has(lower) ||
    /\.(?:db|sqlite|sqlite3)(?:-(?:shm|wal))?$/.test(lower)
  );
}

export function assertAllowedRoot(root) {
  const segments = path.resolve(root).split(path.sep).filter(Boolean);
  if (segments.some(forbiddenName)) {
    throw new Error("sessionsRoot belongs to a forbidden path family");
  }
}

export function isRolloutFile(name) {
  return /^rollout-.+\.jsonl$/i.test(name);
}

export function derivedRolloutDay(sessionsRoot, filePath) {
  const candidates = new Set();
  const basenameMatch = path.basename(filePath).match(/^rollout-(\d{4}-\d{2}-\d{2})(?:T|[-_])/i);
  if (basenameMatch && isValidDay(basenameMatch[1])) {
    candidates.add(basenameMatch[1]);
  }

  const parts = path.relative(sessionsRoot, filePath).split(path.sep);
  for (let index = 0; index <= parts.length - 3; index += 1) {
    if (!/^\d{4}$/.test(parts[index]) || !/^\d{2}$/.test(parts[index + 1]) || !/^\d{2}$/.test(parts[index + 2])) {
      continue;
    }
    const candidate = `${parts[index]}-${parts[index + 1]}-${parts[index + 2]}`;
    if (isValidDay(candidate)) {
      candidates.add(candidate);
    }
  }

  return candidates.size === 1 ? [...candidates][0] : null;
}

const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,159}$/;

function isCanonicalSkillPath(candidate) {
  return (
    typeof candidate === "string"
    && path.isAbsolute(candidate)
    && path.basename(candidate) === "SKILL.md"
    && !path.resolve(candidate).split(path.sep).filter(Boolean).some(forbiddenName)
  );
}

const safeId = (id) => (typeof id === "string" && CATALOG_ID.test(id) ? id : null);

export function canonicalSkillEntries(inventory) {
  const skills = (inventory?.skills ?? []).flatMap(({ id, path: skillPath, targetPath }) => {
    const validId = safeId(id);
    if (!validId) return [];
    return [skillPath, targetPath].filter(isCanonicalSkillPath).map((path) => ({ id: validId, path }));
  });
  const plugins = (inventory?.plugins ?? []).flatMap((plugin) =>
    (plugin.allSkillPaths || plugin.skillPaths || [])
      .filter(isCanonicalSkillPath)
      .map((skillPath) => ({ id: `${plugin.id}:${path.basename(path.dirname(skillPath))}`, path: skillPath }))
      .filter((entry) => safeId(entry.id)),
  );
  return [...skills, ...plugins];
}

export function canonicalSkills(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("canonicalSkillPaths must be an array");
  }

  const byPath = new Map();
  for (const entry of entries) {
    const suppliedPath = typeof entry === "string" ? entry : entry?.path;
    const suppliedId = typeof entry === "string" ? path.basename(path.dirname(entry)) : entry?.id;
    if (typeof suppliedPath !== "string" || !path.isAbsolute(suppliedPath) || path.basename(suppliedPath) !== "SKILL.md") {
      throw new TypeError("each canonical skill path must be an absolute SKILL.md path");
    }
    if (!safeId(suppliedId)) {
      throw new TypeError("each canonical skill id must be a safe catalog identifier");
    }
    if (path.resolve(suppliedPath).split(path.sep).filter(Boolean).some(forbiddenName)) {
      throw new Error("canonical skill belongs to a forbidden path family");
    }
    byPath.set(path.normalize(suppliedPath), suppliedId);
  }
  return byPath;
}
