#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fallbackNamespace = "adhoc";
const defaultCategory = "passes";
export const defaultRoot = path.join(
  os.homedir(),
  "coding",
  "krn",
  "second-opinion-review",
);

function sanitizeNamespace(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectProjectNamespace(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) return fallbackNamespace;
  const namespace = sanitizeNamespace(path.basename(result.stdout.trim()));
  return namespace || fallbackNamespace;
}

function privateDirectory(target, label) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
}

const isRealDir = (entry) => entry.isDirectory() && !entry.isSymbolicLink();

export function prepareArtifactDirectory({
  slug,
  category = defaultCategory,
  project,
  cwd = process.cwd(),
  root = defaultRoot,
  now = new Date(),
} = {}) {
  if (!slugPattern.test(slug ?? "")) {
    throw new Error("slug must use lowercase letters, digits, and single hyphens");
  }
  if (!slugPattern.test(category ?? "")) {
    throw new Error("category must use lowercase letters, digits, and single hyphens");
  }

  privateDirectory(root, "artifact root");

  const namespace = project ? sanitizeNamespace(project) : detectProjectNamespace(cwd);
  if (!slugPattern.test(namespace)) {
    throw new Error("project must sanitize to lowercase letters, digits, and single hyphens");
  }
  const namespaceDirectory = path.join(root, namespace);
  privateDirectory(namespaceDirectory, "project namespace directory");

  const categoryDirectory = path.join(namespaceDirectory, category);
  privateDirectory(categoryDirectory, "category directory");

  const date = now.toISOString().slice(0, 10);
  const passDirectory = fs.mkdtempSync(path.join(categoryDirectory, `${date}-${slug}-`));
  fs.chmodSync(passDirectory, 0o700);
  return passDirectory;
}

function readJobState(passDirectory) {
  const jobsDirectory = path.join(passDirectory, "jobs");
  if (!fs.existsSync(jobsDirectory)) return null;
  // readdirSync order is filesystem-dependent; sort by name so the fold is
  // deterministic. A pass normally has one job file, so last-sorted wins.
  const entries = fs
    .readdirSync(jobsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".job.json"))
    .sort((a, b) => a.name.localeCompare(b.name));
  let state = null;
  for (const entry of entries) {
    try {
      const job = JSON.parse(
        fs.readFileSync(path.join(jobsDirectory, entry.name), "utf8"),
      );
      state = job.state ?? state;
    } catch {
      state = state ?? "unreadable";
    }
  }
  return state;
}

export function listPasses({ root = defaultRoot } = {}) {
  if (!fs.existsSync(root)) return [];
  const passes = [];
  for (const namespace of fs.readdirSync(root, { withFileTypes: true })) {
    if (!isRealDir(namespace)) continue;
    const namespacePath = path.join(root, namespace.name);
    for (const category of fs.readdirSync(namespacePath, { withFileTypes: true })) {
      if (!isRealDir(category)) continue;
      const categoryPath = path.join(namespacePath, category.name);
      for (const pass of fs.readdirSync(categoryPath, { withFileTypes: true })) {
        if (!isRealDir(pass)) continue;
        const passDirectory = path.join(categoryPath, pass.name);
        passes.push({
          namespace: namespace.name,
          category: category.name,
          pass: pass.name,
          path: passDirectory,
          state: readJobState(passDirectory) ?? "unknown",
        });
      }
    }
  }
  passes.sort((a, b) =>
    `${a.namespace}\0${a.category}\0${a.pass}`.localeCompare(
      `${b.namespace}\0${b.category}\0${b.pass}`,
    ),
  );
  return passes;
}

function main(argv) {
  if (argv[0] === "list") {
    if (argv.length !== 1) {
      throw new Error("usage: prepare-artifacts.mjs list");
    }
    const passes = listPasses();
    if (!passes.length) {
      process.stdout.write("(no passes found under the artifact root)\n");
      return;
    }
    process.stdout.write("project\tcategory\tpass\tstate\n");
    for (const pass of passes) {
      process.stdout.write(`${pass.namespace}\t${pass.category}\t${pass.pass}\t${pass.state}\n`);
    }
    return;
  }

  if (argv.length < 1 || argv.length > 2) {
    throw new Error(
      "usage: prepare-artifacts.mjs <lowercase-pass-slug> [category]\n   or: prepare-artifacts.mjs list",
    );
  }
  process.stdout.write(
    `${prepareArtifactDirectory({ slug: argv[0], category: argv[1] ?? defaultCategory })}\n`,
  );
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (invokedAsMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 64;
  }
}
