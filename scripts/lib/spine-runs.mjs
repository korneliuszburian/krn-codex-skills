import { existsSync, readdirSync } from "node:fs";
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
      if (run.name.startsWith(".")) continue;
      runs.push({ workflow: workflow.name, pointer: join(".krn", "runs", workflow.name, run.name) });
    }
  }
  return runs;
}

export function capsuleIds(root) {
  const base = join(root, ".krn", "runs", "delivery-loop");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && existsSync(join(base, entry.name, "state.md")))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}
