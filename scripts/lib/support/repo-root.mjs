import { statSync } from "node:fs";
import { resolve } from "node:path";

import { gitAvailable, runGit as git } from "./git-cli.mjs";

export function resolveRepositoryRoot(repo, { label = "state" } = {}) {
  const requested = resolve(repo);
  const requestedStat = statSync(requested, { throwIfNoEntry: false });
  if (!requestedStat) throw new Error(`repository path does not exist: ${requested}`);
  if (!requestedStat.isDirectory()) throw new Error(`${label} expects a repository directory, got a file: ${requested}`);
  const hasGit = gitAvailable();
  const top = hasGit ? git(requested, ["rev-parse", "--show-toplevel"]) : { ok: false, out: "" };
  return { root: top.ok && top.out ? resolve(top.out) : requested, hasGit };
}
