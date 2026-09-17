import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeCapsule(root, text, id = "out-1") {
  const dir = join(root, ".krn", "runs", "delivery-loop", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.md"), text);
}
