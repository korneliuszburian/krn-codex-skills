import { cpSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

function lstatExists(file) {
  try { lstatSync(file); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// Harness tasks use disposable fixture copies, not live repository clones.
// Git metadata, private KRN state and filesystem links are not task inputs.
export function copyCandidateWorkspace(source, destination, refuse) {
  const from = realpathSync(source);
  if (from !== path.resolve(source)) refuse("workspace-symlink", source);
  let ancestor = path.resolve(destination);
  const missing = [];
  while (!lstatExists(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const to = path.resolve(realpathSync(ancestor), ...missing);
  if (to === from || to.startsWith(`${from}${path.sep}`)) {
    refuse("destination-inside-source", destination);
  }
  cpSync(source, destination, {
    recursive: true,
    filter(entry) {
      if (entry === source) return true;
      const relative = path.relative(source, entry);
      if (relative.split(path.sep).some((part) => part === ".git" || part === ".krn")) return false;
      return !lstatSync(entry).isSymbolicLink();
    },
  });
}
