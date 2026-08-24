#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  gitStagedFiles,
  gitTrackedFiles,
  sealExperiment,
  validateExperimentTree,
} from "./lib/experiment-artifacts.mjs";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let root = scriptRoot;
let id = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--root") root = path.resolve(args[++index] ?? "");
  else if (!id) id = args[index];
}
const experimentsRoot = path.join(root, "evals", "experiments");

if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/.test(id ?? "")) {
  console.error("usage: npm run seal:experiment -- [--root <repo>] <yyyy-mm-dd-slug-vN>");
  process.exit(2);
}

const directory = path.join(experimentsRoot, id);
const manifestPath = path.join(directory, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR missing ${path.relative(root, manifestPath)}`);
  process.exit(1);
}
const manifestStat = fs.lstatSync(manifestPath);
if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink > 1) {
  console.error("ERROR manifest.json must be a regular single-link file before seal");
  process.exit(1);
}

const original = fs.readFileSync(manifestPath);
const currentManifest = JSON.parse(original.toString("utf8"));
const relativeManifest = path.relative(root, manifestPath).split(path.sep).join("/");
const previousResult = spawnSync("git", ["show", `HEAD:${relativeManifest}`], {
  cwd: root,
  encoding: "utf8",
});
const previousManifest = previousResult.status === 0
  ? JSON.parse(previousResult.stdout)
  : null;
if (!previousManifest && ["decided", "abandoned"].includes(currentManifest.status)) {
  console.error("ERROR terminal records require a previously committed checkpoint manifest");
  process.exit(1);
}

const previousIndex = spawnSync("git", ["ls-files", "--stage", "--", relativeManifest], {
  cwd: root,
  encoding: "utf8",
});
let manifestStagedBySeal = false;
function restoreManifestIndex() {
  if (previousIndex.status !== 0) return previousIndex.status;
  const line = previousIndex.stdout.trim();
  if (!line) {
    return spawnSync("git", ["update-index", "--remove", "--", relativeManifest], {
      cwd: root,
      encoding: "utf8",
    }).status;
  }
  const match = line.match(/^(\d+) ([a-f0-9]+) \d\t(.+)$/);
  if (!match) return 1;
  return spawnSync(
    "git",
    ["update-index", "--cacheinfo", `${match[1]},${match[2]},${match[3]}`],
    { cwd: root, encoding: "utf8" },
  ).status;
}

const stagedFiles = gitStagedFiles(root, experimentsRoot);
try {
  const seal = sealExperiment(directory, {
    previousManifest,
    repositoryRoot: root,
    stagedFiles,
  });
  const beforeStage = validateExperimentTree(experimentsRoot);
  if (beforeStage.errors.length) throw new Error(beforeStage.errors.join("; "));
  const add = spawnSync("git", ["add", "--", relativeManifest], {
    cwd: root,
    encoding: "utf8",
  });
  if (add.status !== 0) throw new Error(`git add manifest failed: ${add.stderr.trim()}`);
  manifestStagedBySeal = true;
  const validation = validateExperimentTree(experimentsRoot, {
    trackedFiles: gitTrackedFiles(root, experimentsRoot),
    stagedFiles: gitStagedFiles(root, experimentsRoot),
    repositoryRoot: root,
  });
  if (validation.errors.length) throw new Error(validation.errors.join("; "));
  console.log(`sealed ${id}: ${seal.artifacts} artifacts, manifest SHA-256 ${seal.manifestSha256}`);
} catch (error) {
  fs.writeFileSync(manifestPath, original);
  if (manifestStagedBySeal && restoreManifestIndex() !== 0) {
    console.error("ERROR seal failed and index rollback also failed");
  }
  console.error(`ERROR ${error.message}`);
  process.exit(1);
}
