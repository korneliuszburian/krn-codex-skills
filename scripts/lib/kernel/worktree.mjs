import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function withWorktree({ root, ref, git, prefix = "krn-worktree-" }, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (!git(root, ["worktree", "add", "--detach", dir, ref]).ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return null;
  }
  try {
    return run(dir);
  } finally {
    git(root, ["worktree", "remove", "--force", dir]);
    git(root, ["worktree", "prune"]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
