import path from "node:path";

import { isSafeRelativePath } from "../support/path-rules.mjs";

const SKILL_PATH_GROUPS = ["engineering", "advisory", "meta"];

export function hookFileErrors(hookFiles, { isSafeRelativePath, inspectTarget }) {
  const errors = [];
  const names = new Set();
  if (!Array.isArray(hookFiles)) {
    errors.push("manifest: global_hook_files must be an array");
    return { errors, names };
  }
  for (const hookFile of hookFiles) {
    if (!hookFile || typeof hookFile !== "object" || Array.isArray(hookFile)) {
      errors.push("manifest: global_hook_files entries must be objects");
      continue;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(hookFile.name ?? "")) {
      errors.push(`manifest: invalid global hook file name ${hookFile.name}`);
    }
    if (names.has(hookFile.name)) {
      errors.push(`manifest: duplicate global hook file name ${hookFile.name}`);
    }
    names.add(hookFile.name);
    if (!isSafeRelativePath(hookFile.path)) {
      errors.push(`manifest: unsafe global hook path for ${hookFile.name}`);
      continue;
    }
    if (typeof hookFile.executable !== "boolean") {
      errors.push(`manifest: executable must be boolean for global hook ${hookFile.name}`);
    }
    const target = inspectTarget(hookFile.path);
    if (!target.exists || !target.isFile) {
      errors.push(`manifest: missing global hook target for ${hookFile.name}`);
      continue;
    }
    if (hookFile.executable && !target.executable) {
      errors.push(`manifest: global hook target is not executable for ${hookFile.name}`);
    }
  }
  return { errors, names };
}

export function legacyHookPathErrors(legacyPaths, { isSafeRelativePath, hookNames }) {
  const errors = [];
  const names = new Set();
  if (!Array.isArray(legacyPaths)) {
    errors.push("manifest: legacy_global_hook_paths must be an array");
    return { errors, names };
  }
  for (const legacyPath of legacyPaths) {
    if (typeof legacyPath !== "string") {
      errors.push(`manifest: unsafe legacy global hook path ${legacyPath}`);
      continue;
    }
    if (!isSafeRelativePath(legacyPath)) {
      errors.push(`manifest: unsafe legacy global hook path ${legacyPath}`);
    }
    if (names.has(legacyPath)) {
      errors.push(`manifest: duplicate legacy global hook path ${legacyPath}`);
    }
    names.add(legacyPath);
    const legacyName = legacyPath.split("/").at(-1);
    if (hookNames.has(legacyName)) {
      errors.push(`manifest: legacy global hook path overlaps installed hook ${legacyPath}`);
    }
  }
  return { errors, names };
}

export function binErrors(bins, { isSafeRelativePath, inspectTarget }) {
  const errors = [];
  const names = new Set();
  if (!Array.isArray(bins)) {
    errors.push("manifest: bins must be an array");
    return { errors, names };
  }
  for (const bin of bins) {
    if (!bin || typeof bin !== "object" || Array.isArray(bin)) {
      errors.push("manifest: bins entries must be objects");
      continue;
    }
    if (!/^[a-z0-9](?:-?[a-z0-9]){0,63}$/.test(bin.name ?? "")) {
      errors.push(`manifest: invalid bin name ${bin.name}`);
    }
    if (names.has(bin.name)) {
      errors.push(`manifest: duplicate bin name ${bin.name}`);
    }
    names.add(bin.name);
    if (!isSafeRelativePath(bin.path)) {
      errors.push(`manifest: unsafe bin path for ${bin.name}`);
      continue;
    }
    const target = inspectTarget(bin.path);
    if (!target.exists || !target.isFile) {
      errors.push(`manifest: missing bin target for ${bin.name}`);
      continue;
    }
    if (!target.executable) {
      errors.push(`manifest: bin target is not executable for ${bin.name}`);
    }
  }
  return { errors, names };
}

export function pretoolUseHookErrors(hooks, label) {
  const errors = [];
  const preToolUse = hooks.hooks?.PreToolUse;
  if (!Array.isArray(preToolUse) || preToolUse.length !== 1) {
    errors.push(`${label}: expected one PreToolUse matcher group`);
    return errors;
  }
  const group = preToolUse[0];
  const handlers = group?.hooks;
  if (
    group?.matcher !== "^(Bash|apply_patch)$" ||
    !Array.isArray(handlers) ||
    handlers.length !== 1
  ) {
    errors.push(`${label}: expected one exact command and edit hook`);
    return errors;
  }
  const handler = handlers[0];
  if (
    handler?.type !== "command" ||
    typeof handler?.command !== "string" ||
    !handler.command.includes("/hooks/krn_pretooluse.py")
  ) {
    errors.push(`${label}: invalid global PreToolUse handler`);
  }
  return errors;
}

export function retirementErrors(retiredSkills, localSkillNames) {
  const errors = [];
  if (!Array.isArray(retiredSkills)) {
    errors.push("manifest: retired_skills must be an array");
  }
  const names = new Set();
  for (const retired of (Array.isArray(retiredSkills) ? retiredSkills : [])) {
    if (!retired || typeof retired !== "object" || Array.isArray(retired)) {
      errors.push("manifest: retired skill metadata must be an object");
      continue;
    }
    const keys = Object.keys(retired).sort();
    if (keys.join(",") !== "name,replacement") {
      errors.push(
        `manifest: retired skill ${retired.name ?? "<unknown>"} must contain only name and replacement`,
      );
    }
    if (!/^[a-z0-9](?:-?[a-z0-9]){0,63}$/.test(retired.name ?? "")) {
      errors.push(`manifest: invalid retired skill name ${retired.name}`);
      continue;
    }
    if (names.has(retired.name)) {
      errors.push(`manifest: duplicate retired skill name ${retired.name}`);
    }
    names.add(retired.name);
    if (localSkillNames.has(retired.name)) {
      errors.push(`manifest: retired skill ${retired.name} is still active`);
    }
    if (
      retired.replacement !== null &&
      (typeof retired.replacement !== "string" ||
        !localSkillNames.has(retired.replacement))
    ) {
      errors.push(
        `manifest: retired skill ${retired.name} has unknown replacement ${retired.replacement}`,
      );
    }
    if (retired.replacement === retired.name) {
      errors.push(`manifest: retired skill ${retired.name} cannot replace itself`);
    }
  }
  return { errors, names };
}

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
    const nameIsValid = /^[a-z0-9](?:-?[a-z0-9]){0,63}$/.test(skill.name ?? "");
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
