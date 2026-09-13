import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

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

export function runDirectories(root) {
  return runDirectoriesDetailed(root).runs;
}

export function capsuleIdsDetailed(root) {
  const base = join(root, ".krn", "runs", "delivery-loop");
  let storePresent;
  const storeError = (detail) => ({ ids: [], errors: [{ rule: "unreadable-capsule-store", detail }] });
  try { storePresent = lstatSync(base, { throwIfNoEntry: false }); } catch { return storeError(".krn/runs/delivery-loop could not be listed"); }
  if (!storePresent) return { ids: [], errors: [] };
  let target;
  try { target = statSync(base, { throwIfNoEntry: false }); } catch { return storeError(".krn/runs/delivery-loop could not be listed"); }
  if (!target) return storeError(".krn/runs/delivery-loop is a broken symlink");
  if (!target.isDirectory()) return storeError(".krn/runs/delivery-loop is not a directory");
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return storeError(".krn/runs/delivery-loop could not be listed");
  }
  const errors = [];
  const seen = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const directory = join(base, entry.name);
    const relativePath = `.krn/runs/delivery-loop/${entry.name}/state.md`;
    let statePresent;
    try { statePresent = lstatSync(join(directory, "state.md"), { throwIfNoEntry: false }); } catch { errors.push({ rule: "unreadable-capsule", detail: relativePath }); continue; }
    if (!statePresent) continue;
    let stateStat;
    try { stateStat = statSync(join(directory, "state.md"), { throwIfNoEntry: false }); } catch { errors.push({ rule: "unreadable-capsule", detail: relativePath }); continue; }
    if (!stateStat) { errors.push({ rule: "unreadable-capsule", detail: `${relativePath} is a broken symlink` }); continue; }
    if (!stateStat.isFile()) { errors.push({ rule: "unreadable-capsule", detail: `${relativePath} is not a regular file` }); continue; }
    try { readFileSync(join(directory, "state.md")); } catch { errors.push({ rule: "unreadable-capsule", detail: relativePath }); continue; }
    let real;
    try { real = realpathSync(directory); } catch { continue; }
    const link = entry.isSymbolicLink();
    const previous = seen.get(real);
    if (!previous || (previous.link && !link)) seen.set(real, { id: entry.name, link });
  }
  return { ids: [...seen.values()].map((entry) => entry.id).sort((a, b) => a.localeCompare(b)), errors };
}

export function capsuleIds(root) {
  return capsuleIdsDetailed(root).ids;
}
