import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function withWorktree({ root, ref, git, prefix = "krn-worktree-" }, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const added = git(root, ["worktree", "add", "--detach", dir, ref]);
  if (added && added.ok === false) {
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
