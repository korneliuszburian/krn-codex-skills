import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

export function runDirectories(root) {
  const runsBase = join(root, ".krn", "runs");
  if (!existsSync(runsBase)) return [];
  const runs = [];
  let workflows;
  try {
    workflows = readdirSync(runsBase, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const workflow of workflows.sort((a, b) => a.name.localeCompare(b.name))) {
    if ((!workflow.isDirectory() && !workflow.isSymbolicLink()) || workflow.name === "delivery-loop" || workflow.name.startsWith(".")) continue;
    const workflowPath = join(runsBase, workflow.name);
    let entries;
    try {
      entries = readdirSync(workflowPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const run of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!run.isDirectory() && !run.isSymbolicLink()) continue;
      runs.push({ workflow: workflow.name, pointer: join(".krn", "runs", workflow.name, run.name) });
    }
  }
  return runs;
}

export function capsuleIds(root) {
  const base = join(root, ".krn", "runs", "delivery-loop");
  if (!existsSync(base)) return [];
  const seen = new Map();
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const directory = join(base, entry.name);
    if (!existsSync(join(directory, "state.md"))) continue;
    let real;
    try { real = realpathSync(directory); } catch { continue; }
    const link = entry.isSymbolicLink();
    const previous = seen.get(real);
    if (!previous || (previous.link && !link)) seen.set(real, { id: entry.name, link });
  }
  return [...seen.values()].map((entry) => entry.id).sort((a, b) => a.localeCompare(b));
}
