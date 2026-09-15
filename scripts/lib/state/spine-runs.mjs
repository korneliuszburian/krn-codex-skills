import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { isInside } from "../support/path-rules.mjs";

export function runDirectoriesDetailed(root) {
  const runsBase = join(root, ".krn", "runs");
  if (!existsSync(runsBase)) return { runs: [], errors: [] };
  const runs = [];
  const errors = [];
  let workflows;
  try {
    workflows = readdirSync(runsBase, { withFileTypes: true });
  } catch {
    return { runs: [], errors: [".krn/runs could not be listed"] };
  }
  for (const workflow of workflows.sort((a, b) => a.name.localeCompare(b.name))) {
    if ((!workflow.isDirectory() && !workflow.isSymbolicLink()) || workflow.name === "delivery-loop") continue;
    const workflowPath = join(runsBase, workflow.name);
    let entries;
    try {
      entries = readdirSync(workflowPath, { withFileTypes: true });
    } catch {
      errors.push(`${join(".krn", "runs", workflow.name)} could not be listed`);
      continue;
    }
    for (const run of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!run.isDirectory() && !run.isSymbolicLink()) continue;
      runs.push({ workflow: workflow.name, pointer: join(".krn", "runs", workflow.name, run.name) });
    }
  }
  return { runs, errors };
}

export function capsuleStoreReport(root) {
  const base = join(root, ".krn", "runs", "delivery-loop");
  const storeErrors = [];
  const storeError = (detail) => {
    storeErrors.push({ rule: "unreadable-capsule-store", detail });
    return { storeErrors, entries: [] };
  };
  let storePresent;
  try { storePresent = lstatSync(base, { throwIfNoEntry: false }); } catch { return storeError(".krn/runs/delivery-loop could not be listed"); }
  if (!storePresent) return { storeErrors, entries: [] };
  let target;
  try { target = statSync(base, { throwIfNoEntry: false }); } catch { return storeError(".krn/runs/delivery-loop could not be listed"); }
  if (!target) return storeError(".krn/runs/delivery-loop is a broken symlink");
  if (!target.isDirectory()) return storeError(".krn/runs/delivery-loop is not a directory");
  let raw;
  try {
    raw = readdirSync(base, { withFileTypes: true });
  } catch {
    return storeError(".krn/runs/delivery-loop could not be listed");
  }
  let realRoot;
  try { realRoot = realpathSync(root); } catch { realRoot = root; }
  const entries = [];
  for (const entry of raw) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const directory = join(base, entry.name);
    const relativePath = `.krn/runs/delivery-loop/${entry.name}/state.md`;
    const link = entry.isSymbolicLink();
    let real;
    try { real = realpathSync(directory); } catch { entries.push({ id: entry.name, link, kind: "resolve", relativePath }); continue; }
    let directoryStat;
    try { directoryStat = statSync(real); } catch { continue; }
    if (!directoryStat.isDirectory()) continue;
    if (!isInside(realRoot, real)) { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "capsule-outside-repo", detail: real } }); continue; }
    const file = join(directory, "state.md");
    let statePresent;
    try { statePresent = lstatSync(file, { throwIfNoEntry: false }); } catch { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: relativePath } }); continue; }
    if (!statePresent) continue;
    let stateStat;
    try { stateStat = statSync(file, { throwIfNoEntry: false }); } catch { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: relativePath } }); continue; }
    if (!stateStat) { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: `${relativePath} is a broken symlink` } }); continue; }
    if (!stateStat.isFile()) { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: `${relativePath} is not a regular file` } }); continue; }
    let resolvedState;
    try { resolvedState = realpathSync(file); } catch { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: relativePath } }); continue; }
    if (!isInside(realRoot, resolvedState)) { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "capsule-outside-repo", detail: resolvedState } }); continue; }
    let text;
    try { text = readFileSync(file, "utf8"); } catch { entries.push({ id: entry.name, link, resolvedDirectory: real, error: { rule: "unreadable-capsule", detail: relativePath } }); continue; }
    entries.push({ id: entry.name, link, resolvedDirectory: real, state: { relativePath, resolvedRelativePath: relative(realRoot, resolvedState).split(sep).join("/"), text } });
  }
  return { storeErrors, entries };
}

export function capsuleIdsDetailed(root) {
  const { storeErrors, entries } = capsuleStoreReport(root);
  const errors = [...storeErrors];
  const seen = new Map();
  for (const entry of entries) {
    if (entry.kind === "resolve") { errors.push({ rule: "unreadable-capsule", detail: `${entry.relativePath} cannot be resolved` }); continue; }
    if (entry.error) { errors.push(entry.error); continue; }
    const previous = seen.get(entry.resolvedDirectory);
    if (!previous || (previous.link && !entry.link)) seen.set(entry.resolvedDirectory, { id: entry.id, link: entry.link });
  }
  return { ids: [...seen.values()].map((entry) => entry.id).sort((a, b) => a.localeCompare(b)), errors };
}


