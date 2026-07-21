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

function detectRepositoryRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return fs.realpathSync(result.stdout.trim());
}

function assertInsideRepository(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error("working_runs must resolve inside the repository");
}

function assertExistingAncestorsInside(repositoryRoot, candidate) {
  let cursor = candidate;
  while (!fs.existsSync(cursor)) cursor = path.dirname(cursor);
  assertInsideRepository(repositoryRoot, fs.realpathSync(cursor));
}

function resolveArtifactLayout({ cwd = process.cwd() } = {}) {
  const repositoryRoot = detectRepositoryRoot(cwd);
  if (!repositoryRoot) return { root: defaultRoot, repositoryRoot: null };

  const configPath = path.join(repositoryRoot, "docs", "agents", "artifact-paths.json");
  if (!fs.existsSync(configPath)) return { root: defaultRoot, repositoryRoot: null };
  const configStat = fs.lstatSync(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink()) {
    throw new Error("artifact-paths.json must be a real file");
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw new Error("artifact-paths.json must contain valid JSON");
  }
  if (config.schema_version !== 1 || typeof config.working_runs !== "string") {
    throw new Error("artifact-paths.json must define schema_version 1 and working_runs");
  }
  if (path.isAbsolute(config.working_runs) || config.working_runs.trim() === "") {
    throw new Error("working_runs must be a non-empty repository-relative path");
  }

  const configuredRoot = path.resolve(repositoryRoot, config.working_runs, "second-opinion-review");
  assertInsideRepository(repositoryRoot, configuredRoot);
  assertExistingAncestorsInside(repositoryRoot, configuredRoot);
  return { root: configuredRoot, repositoryRoot };
}

export function resolveArtifactRoot(options = {}) {
  return resolveArtifactLayout(options).root;
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
  root,
  now = new Date(),
} = {}) {
  if (!slugPattern.test(slug ?? "")) {
    throw new Error("slug must use lowercase letters, digits, and single hyphens");
  }
  if (!slugPattern.test(category ?? "")) {
    throw new Error("category must use lowercase letters, digits, and single hyphens");
  }

  const layout = root ? { root, repositoryRoot: null } : resolveArtifactLayout({ cwd });
  const artifactRoot = layout.root;
  privateDirectory(artifactRoot, "artifact root");

  const namespace = project ? sanitizeNamespace(project) : detectProjectNamespace(cwd);
  if (!slugPattern.test(namespace)) {
    throw new Error("project must sanitize to lowercase letters, digits, and single hyphens");
  }
  if (layout.repositoryRoot) {
    const date = now.toISOString().slice(0, 10);
    const passDirectory = fs.mkdtempSync(
      path.join(artifactRoot, `${date}-${category}-${slug}-`),
    );
    fs.chmodSync(passDirectory, 0o700);
    return passDirectory;
  }

  const namespaceDirectory = path.join(artifactRoot, namespace);
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

export function listPasses({ root, cwd = process.cwd() } = {}) {
  const layout = root ? { root, repositoryRoot: null } : resolveArtifactLayout({ cwd });
  root = layout.root;
  if (!fs.existsSync(root)) return [];
  const passes = [];
  if (layout.repositoryRoot) {
    const namespace = sanitizeNamespace(path.basename(layout.repositoryRoot));
    for (const pass of fs.readdirSync(root, { withFileTypes: true })) {
      if (!isRealDir(pass)) continue;
      const match = pass.name.match(/^\d{4}-\d{2}-\d{2}-(research|rewrite|check|passes)-/);
      const passPath = path.join(root, pass.name);
      passes.push({
        namespace,
        category: match?.[1] ?? "unknown",
        pass: pass.name,
        path: passPath,
        state: readJobState(passPath) ?? "unknown",
      });
    }
    passes.sort((a, b) => a.pass.localeCompare(b.pass));
    return passes;
  }
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
