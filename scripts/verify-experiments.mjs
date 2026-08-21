#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  gitStagedFiles,
  gitTrackedFiles,
  validateExperimentTree,
} from "./lib/experiment-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const experimentsRoot = path.join(root, "evals", "experiments");
const result = validateExperimentTree(experimentsRoot, {
  trackedFiles: gitTrackedFiles(root, experimentsRoot),
  stagedFiles: gitStagedFiles(root, experimentsRoot),
  repositoryRoot: root,
});

if (result.errors.length) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(
  `verified ${result.experimentCount} experiment manifests and ${result.artifactCount} artifacts`,
);
