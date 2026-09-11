import path from "node:path";

import { isSafeRelativePath } from "./path-rules.mjs";

const SKILL_PATH_GROUPS = ["engineering", "advisory", "frontend", "meta"];

export function validateManifestSkills(document) {
  const errors = [];
  if (!Array.isArray(document.skills)) {
    errors.push("manifest: skills must be an array");
  }
  if (!Array.isArray(document.source_only_skills)) {
    errors.push("manifest: source_only_skills must be an array");
  }
  const installableSkills = Array.isArray(document.skills) ? document.skills : [];
  const sourceOnlySkills = Array.isArray(document.source_only_skills)
    ? document.source_only_skills
    : [];
  const allLocalSkills = [...installableSkills, ...sourceOnlySkills];
  const names = new Set();
  const paths = new Set();
  const valid = [];
  for (const skill of allLocalSkills) {
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) {
      errors.push("manifest: skill metadata must be an object");
      continue;
    }
    const keys = Object.keys(skill).sort();
    const keysAreValid = keys.join(",") === "implicit,name,path";
    if (!keysAreValid) {
      errors.push(`manifest: skill ${skill.name ?? "<unknown>"} must contain only implicit, name, and path`);
    }
    const nameIsValid = /^[a-z0-9-]{1,63}$/.test(skill.name ?? "");
    if (!nameIsValid) {
      errors.push(`manifest: invalid skill name ${skill.name}`);
    }
    if (names.has(skill.name)) {
      errors.push(`manifest: duplicate skill name ${skill.name}`);
    }
    names.add(skill.name);
    const pathIsUnsafe =
      typeof skill.path !== "string" ||
      path.isAbsolute(skill.path) ||
      skill.path.split("/").includes("..");
    if (pathIsUnsafe) {
      errors.push(`manifest: unsafe path for ${skill.name}`);
    } else if (paths.has(skill.path)) {
      errors.push(`manifest: duplicate skill path ${skill.path}`);
    } else {
      paths.add(skill.path);
    }
    const implicitIsValid = typeof skill.implicit === "boolean";
    if (!implicitIsValid) {
      errors.push(`manifest: implicit must be boolean for ${skill.name}`);
    }

    let pathShapeIsValid = false;
    if (!pathIsUnsafe) {
      const pathParts = skill.path.split("/");
      pathShapeIsValid =
        pathParts.length === 3 &&
        pathParts[0] === "skills" &&
        SKILL_PATH_GROUPS.includes(pathParts[1]) &&
        pathParts[2] === skill.name;
      if (!pathShapeIsValid) {
        errors.push(`manifest: skill path must be skills/<group>/${skill.name}`);
      }
    }
    if (keysAreValid && nameIsValid && !pathIsUnsafe && pathShapeIsValid && implicitIsValid) {
      valid.push(skill);
    }
  }
  if (document.harness_skills !== undefined) {
    if (!Array.isArray(document.harness_skills) || document.harness_skills.length === 0) {
      errors.push("manifest: harness_skills must be a non-empty array");
    } else {
      for (const name of document.harness_skills) {
        if (!names.has(name)) {
          errors.push(`manifest: harness skill ${name} is not a local installable skill`);
        }
      }
    }
  }
  if (!Array.isArray(document.runtime_paths) || document.runtime_paths.length === 0) {
    errors.push("manifest: runtime_paths must be a non-empty array");
  } else {
    for (const relative of document.runtime_paths) {
      if (!isSafeRelativePath(relative)) {
        errors.push(`manifest: unsafe runtime path ${relative}`);
      }
    }
  }
  return { errors, names, paths, valid, installableSkills, sourceOnlySkills };
}
