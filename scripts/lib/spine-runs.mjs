import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function runDirectories(root) {
  const runsBase = join(root, ".krn", "runs");
  if (!existsSync(runsBase)) return [];
  const runs = [];
  for (const workflow of readdirSync(runsBase, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!workflow.isDirectory() || workflow.name === "delivery-loop") continue;
    const workflowPath = join(runsBase, workflow.name);
    for (const run of readdirSync(workflowPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!run.isDirectory()) continue;
      runs.push({ workflow: workflow.name, pointer: join(".krn", "runs", workflow.name, run.name) });
    }
  }
  return runs;
}

export function capsuleIds(root) {
  const base = join(root, ".krn", "runs", "delivery-loop");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(base, entry.name, "state.md")))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}
