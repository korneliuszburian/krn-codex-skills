#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fallbackNamespace = "adhoc";
const defaultCategory = "passes";

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

function resolveProjectNamespace({ project, cwd }) {
  if (project !== undefined && project !== "") {
    const namespace = sanitizeNamespace(project);
    if (!slugPattern.test(namespace)) {
      throw new Error(
        "SECOND_OPINION_PROJECT must sanitize to lowercase letters, digits, and single hyphens",
      );
    }
    return namespace;
  }
  return detectProjectNamespace(cwd);
}

function resolveArtifactRoot({ root, stateHome }) {
  if (root && !path.isAbsolute(root)) {
    throw new Error("SECOND_OPINION_ARTIFACT_ROOT must be absolute");
  }
  if (stateHome && !path.isAbsolute(stateHome)) {
    throw new Error("XDG_STATE_HOME must be absolute");
  }
  return root
    ? path.resolve(root)
    : path.join(
        stateHome ? path.resolve(stateHome) : path.join(os.homedir(), ".local", "state"),
        "krn",
        "second-opinion-review",
      );
}

function assertPrivateRealDirectory(target, label) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
}

function prepareArtifactDirectory({
  slug,
  category = defaultCategory,
  root = process.env.SECOND_OPINION_ARTIFACT_ROOT,
  stateHome = process.env.XDG_STATE_HOME,
  project = process.env.SECOND_OPINION_PROJECT,
  cwd = process.cwd(),
  now = new Date(),
} = {}) {
  if (!slugPattern.test(slug ?? "")) {
    throw new Error("slug must use lowercase letters, digits, and single hyphens");
  }
  if (!slugPattern.test(category ?? "")) {
    throw new Error("category must use lowercase letters, digits, and single hyphens");
  }

  const selectedRoot = resolveArtifactRoot({ root, stateHome });
  fs.mkdirSync(selectedRoot, { recursive: true, mode: 0o700 });
  assertPrivateRealDirectory(selectedRoot, "artifact root");

  const namespace = resolveProjectNamespace({ project, cwd });
  const namespaceDirectory = path.join(selectedRoot, namespace);
  fs.mkdirSync(namespaceDirectory, { recursive: true, mode: 0o700 });
  assertPrivateRealDirectory(namespaceDirectory, "project namespace directory");

  const categoryDirectory = path.join(namespaceDirectory, category);
  fs.mkdirSync(categoryDirectory, { recursive: true, mode: 0o700 });
  assertPrivateRealDirectory(categoryDirectory, "category directory");

  const date = now.toISOString().slice(0, 10);
  const passDirectory = fs.mkdtempSync(path.join(categoryDirectory, `${date}-${slug}-`));
  fs.chmodSync(passDirectory, 0o700);
  return passDirectory;
}

function readJobState(passDirectory) {
  const jobsDirectory = path.join(passDirectory, "jobs");
  if (!fs.existsSync(jobsDirectory)) return null;
  let state = null;
  for (const entry of fs.readdirSync(jobsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".job.json")) continue;
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

function listPasses({
  root = process.env.SECOND_OPINION_ARTIFACT_ROOT,
  stateHome = process.env.XDG_STATE_HOME,
} = {}) {
  const selectedRoot = resolveArtifactRoot({ root, stateHome });
  if (!fs.existsSync(selectedRoot)) return [];
  const passes = [];
  for (const namespace of fs.readdirSync(selectedRoot, { withFileTypes: true })) {
    if (!namespace.isDirectory() || namespace.isSymbolicLink()) continue;
    const namespacePath = path.join(selectedRoot, namespace.name);
    for (const category of fs.readdirSync(namespacePath, { withFileTypes: true })) {
      if (!category.isDirectory() || category.isSymbolicLink()) continue;
      const categoryPath = path.join(namespacePath, category.name);
      for (const pass of fs.readdirSync(categoryPath, { withFileTypes: true })) {
        if (!pass.isDirectory() || pass.isSymbolicLink()) continue;
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
    a.namespace === b.namespace
      ? a.category === b.category
        ? a.pass.localeCompare(b.pass)
        : a.category.localeCompare(b.category)
      : a.namespace.localeCompare(b.namespace),
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
      process.stdout.write("(no passes found under the configured artifact root)\n");
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

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 64;
}
