#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function prepareArtifactDirectory({
  slug,
  root = process.env.SECOND_OPINION_ARTIFACT_ROOT,
  stateHome = process.env.XDG_STATE_HOME,
  now = new Date(),
} = {}) {
  if (!slugPattern.test(slug ?? "")) {
    throw new Error("slug must use lowercase letters, digits, and single hyphens");
  }

  const selectedRoot = root
    ? path.resolve(root)
    : path.join(
        stateHome ? path.resolve(stateHome) : path.join(os.homedir(), ".local", "state"),
        "krn",
        "second-opinion-review",
      );
  if (root && !path.isAbsolute(root)) {
    throw new Error("SECOND_OPINION_ARTIFACT_ROOT must be absolute");
  }
  if (stateHome && !path.isAbsolute(stateHome)) {
    throw new Error("XDG_STATE_HOME must be absolute");
  }

  fs.mkdirSync(selectedRoot, { recursive: true, mode: 0o700 });
  const rootStat = fs.lstatSync(selectedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("artifact root must be a real directory, not a symlink");
  }

  const date = now.toISOString().slice(0, 10);
  const passDirectory = fs.mkdtempSync(path.join(selectedRoot, `${date}-${slug}-`));
  fs.chmodSync(passDirectory, 0o700);
  return passDirectory;
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("usage: prepare-artifacts.mjs <lowercase-pass-slug>");
  }
  process.stdout.write(`${prepareArtifactDirectory({ slug: argv[0] })}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 64;
}
