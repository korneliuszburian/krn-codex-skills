import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../kernel/digest.mjs";
import { hasPinnedUpstreamOrigin } from "../catalog/capability-admission.mjs";
import { walkFiles } from "../kernel/walk.mjs";
import { assertAllowedPath, readSmallJson, resolveTargetFile } from "../catalog/catalog-inventory-paths.mjs";
import { createQuarantineCollector } from "../catalog/catalog-inventory-records.mjs";
import { requireDirectoryWithoutSymlinks } from "../catalog/catalog-path-safety.mjs";
import { parseDocument } from "../catalog/catalog-toml.mjs";
import { applyOperations, parseSkillPath } from "../catalog/catalog-document.mjs";
import { digest, planCatalogConfig } from "../catalog/catalog-plan.mjs";

const PRODUCER = "# krn-equivalent-export ";

export async function skillDirectoryDigest(directory) {
  await requireDirectoryWithoutSymlinks(directory, { beforeAccess: assertAllowedPath });
  const parts = [];
  for (const entry of walkFiles(directory, {
    onError: "throw", beforeAccess: assertAllowedPath,
    compare: (left, right) => left.name.localeCompare(right.name),
    onEntry: ({ dirent }) => { if (dirent.isSymbolicLink()) throw new Error("skill closure contains a symbolic link"); },
  })) parts.push(entry.relative, "\0", fs.readFileSync(entry.path), "\0");
  return sha256Hex(...parts);
}

async function hasOwnedGlobalOrigin(skill, owner, codexHome, quarantine) {
  const actual = await resolveTargetFile(skill.path, quarantine);
  if (!actual.file || actual.file !== skill.targetPath) return false;
  if (owner.origin === "krn") {
    const expected = await resolveTargetFile(path.join(codexHome, "krn", "current", owner.path, "SKILL.md"), quarantine);
    return expected.file === actual.file;
  }
  return hasPinnedUpstreamOrigin(actual.file, owner);
}

// Export metadata owns the candidate set. The existing TOML block carries
// producer ownership; no separate registry of project paths is maintained.
export async function planProjectSkillComposition({ root, codexHome, admission, inventory, desired, source }) {
  root = path.resolve(root);
  assertAllowedPath(root);
  const directory = path.join(root, ".agents", "skills");
  const producer = `${PRODUCER}${JSON.stringify(root)}`;
  const document = parseDocument(source);
  const existing = new Map();
  const owned = new Set();
  for (const block of document.blocks.filter((entry) => entry.kind === "skill")) {
    const target = parseSkillPath(document, block);
    if (!target.startsWith(`${directory}${path.sep}`)) continue;
    existing.set(target, block);
    if (document.lines[block.startLineIndex + 1]?.content === producer) owned.add(target);
  }
  const states = Object.fromEntries([...owned].map((target) => [target, true]));
  const equivalent = [];
  const unavailable = [];
  const quarantine = createQuarantineCollector([], []);
  const present = await requireDirectoryWithoutSymlinks(directory, { allowMissing: true, beforeAccess: assertAllowedPath });
  const marker = present ? await readSmallJson(path.join(directory, ".krn-export.json"), 1024 * 1024, quarantine) : undefined;
  if (marker?.schemaVersion === 1 && Array.isArray(marker.skills)) {
    for (const name of marker.skills) {
      if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error("invalid exported owner name");
      assertAllowedPath(name);
      const owner = admission.owners?.[name];
      if (!owner) continue;
      const project = path.join(directory, name, "SKILL.md");
      // A user-authored override stays theirs, even when it happens to match.
      if (existing.has(project) && !owned.has(project)) continue;
      const candidates = inventory.skills.filter((skill) => skill.id === name && skill.scope === "global-index" && desired.skills?.[skill.path] === true);
      let equal = false;
      for (const candidate of candidates) {
        if (!await hasOwnedGlobalOrigin(candidate, owner, codexHome, quarantine)) continue;
        try {
          const localDigest = await skillDirectoryDigest(path.dirname(project));
          equal = localDigest === marker.digests?.[name] && localDigest === await skillDirectoryDigest(path.dirname(candidate.targetPath));
        } catch { equal = false; }
        if (equal) break;
      }
      if (equal) { states[project] = false; equivalent.push(project); }
      else unavailable.push(project);
    }
  }
  const plan = planCatalogConfig({ source, desired: { skills: states } });
  const after = parseDocument(plan.nextSource);
  const annotations = [];
  for (const block of after.blocks.filter((entry) => entry.kind === "skill")) {
    const target = parseSkillPath(after, block);
    if (states[target] !== false || owned.has(target) || existing.has(target)) continue;
    annotations.push({ start: after.lines[block.startLineIndex].end, end: after.lines[block.startLineIndex].end, text: `${producer}${after.eol}` });
  }
  const nextSource = applyOperations(plan.nextSource, annotations);
  return { ...plan, nextSource, nextHash: digest(nextSource), changed: nextSource !== source, equivalent, unavailable, restored: [...owned].filter((target) => states[target] === true) };
}
