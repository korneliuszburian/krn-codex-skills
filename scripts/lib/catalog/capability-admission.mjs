import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../kernel/json.mjs";
import { gitText, gitTopLevel } from "../kernel/git.mjs";
import { isHardQuarantined } from "./catalog-profiles.mjs";

const SOURCE = fileURLToPath(new URL("../../../", import.meta.url));

function validName(name) {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name) || isHardQuarantined(name)) {
    throw new Error("invalid admitted skill name");
  }
  return name;
}

export function hasPinnedUpstreamOrigin(targetPath, owner) {
  if (typeof targetPath !== "string" || typeof owner?.path !== "string" || typeof owner.repository !== "string" || typeof owner.commit !== "string") return false;
  if (!targetPath.endsWith(`${path.sep}${owner.path}`)) return false;
  const upstream = targetPath.slice(0, -owner.path.length - 1);
  return gitTopLevel(upstream) === upstream
    && gitText(upstream, ["remote", "get-url", "origin"]) === owner.repository
    && gitText(upstream, ["rev-parse", "HEAD"]) === owner.commit
    && gitText(upstream, ["status", "--porcelain", "--untracked-files=all", "--ignored=matching", "--", path.posix.dirname(owner.path)]) === "";
}

export function deriveSkillAdmission(manifest, lock) {
  if (!Array.isArray(manifest?.skills) || !Array.isArray(lock?.sources)) throw new Error("admission requires manifest skills and pinned sources");
  const owners = new Map();
  const companionEdges = {};
  const add = (name, owner) => {
    validName(name);
    if (owners.has(name)) throw new Error(`duplicate admitted skill owner: ${name}`);
    owners.set(name, owner);
  };
  for (const skill of manifest.skills) add(skill.name, { origin: "krn", path: skill.path });
  for (const source of lock.sources) {
    if (!Array.isArray(source.harness_paths) || source.harness_paths.length === 0) throw new Error(`source ${source.id} requires explicit harness_paths`);
    const available = new Map();
    for (const relative of source.required_paths ?? []) {
      if (typeof relative !== "string" || !/^skills\/[a-z0-9-]+\/[a-z0-9-]+\/SKILL\.md$/.test(relative)) throw new Error("invalid pinned skill path");
      const name = validName(path.posix.basename(path.posix.dirname(relative)));
      if (available.has(name)) throw new Error(`duplicate pinned skill: ${name}`);
      available.set(name, relative);
    }
    for (const [owner, companions] of Object.entries(source.companions ?? {})) {
      if (!available.has(owner) || !Array.isArray(companions)) throw new Error(`invalid companion owner: ${owner}`);
      for (const name of companions) if (!available.has(name)) throw new Error(`unknown companion: ${owner} -> ${name}`);
    }
    Object.assign(companionEdges, source.companions ?? {});
    const visited = new Set();
    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);
      add(name, { origin: source.id, path: available.get(name), commit: source.commit, repository: source.repository });
      for (const companion of source.companions?.[name] ?? []) visit(companion);
    };
    for (const relative of source.harness_paths) {
      const name = path.posix.basename(path.posix.dirname(relative));
      if (available.get(name) !== relative) throw new Error(`harness path is not pinned: ${relative}`);
      visit(name);
    }
  }
  return { names: [...owners.keys()].sort(), owners: Object.fromEntries(owners), companions: companionEdges };
}

export function loadSkillAdmission(source = SOURCE) {
  return deriveSkillAdmission(readJson(path.join(source, "skills", "manifest.json")), readJson(path.join(source, "config", "upstream-sources.json")));
}
