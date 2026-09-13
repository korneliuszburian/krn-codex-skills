import path from "node:path";

import { isSafeRelativePath } from "../support/path-rules.mjs";

const PREFIX = "config/upstream-sources.json";

export function upstreamSourceErrors(document) {
  const errors = [];
  if (document?.schema_version !== 1) {
    errors.push(`${PREFIX}: schema_version must be 1`);
  }
  if (!Array.isArray(document?.sources) || document.sources.length === 0) {
    errors.push(`${PREFIX}: sources must be a non-empty array`);
    return errors;
  }
  const sourceIds = new Set();
  for (const source of document.sources) {
    if (!source || typeof source !== "object") {
      errors.push(`${PREFIX}: every source must be an object`);
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(source.id ?? "")) {
      errors.push(`${PREFIX}: invalid source id ${source.id}`);
    }
    if (sourceIds.has(source.id)) {
      errors.push(`${PREFIX}: duplicate source id ${source.id}`);
    }
    sourceIds.add(source.id);
    if (typeof source.repository !== "string" || !/^https:\/\//.test(source.repository)) {
      errors.push(`${PREFIX}: invalid repository for ${source.id}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(source.commit ?? "")) {
      errors.push(`${PREFIX}: invalid commit for ${source.id}`);
    }
    if (!Array.isArray(source.required_paths) || source.required_paths.length === 0) {
      errors.push(`${PREFIX}: required_paths must be non-empty for ${source.id}`);
      continue;
    }
    const paths = new Set();
    for (const requiredPath of source.required_paths) {
      if (!isSafeRelativePath(requiredPath) || !requiredPath.startsWith("skills/")) {
        errors.push(`${PREFIX}: unsafe required path ${requiredPath}`);
      }
      if (paths.has(requiredPath)) {
        errors.push(`${PREFIX}: duplicate required path ${requiredPath}`);
      }
      paths.add(requiredPath);
    }
    if (source.harness_paths !== undefined) {
      if (!Array.isArray(source.harness_paths) || source.harness_paths.length === 0) {
        errors.push(`${PREFIX}: harness_paths must be non-empty for ${source.id}`);
      } else {
        for (const harnessPath of source.harness_paths) {
          if (!paths.has(harnessPath)) {
            errors.push(`${PREFIX}: harness path ${harnessPath} is not in required_paths`);
          }
        }
      }
    }
  }
  if (!sourceIds.has("mattpocock/skills")) {
    errors.push(`${PREFIX}: missing mattpocock/skills source`);
  }
  return errors;
}

export function upstreamSkillNamesFrom(document) {
  const sources = Array.isArray(document?.sources) ? document.sources : [];
  return sources.flatMap((source) =>
    (Array.isArray(source?.required_paths) ? source.required_paths : [])
      .filter((requiredPath) => typeof requiredPath === "string")
      .map((requiredPath) => path.basename(path.dirname(requiredPath))),
  );
}
