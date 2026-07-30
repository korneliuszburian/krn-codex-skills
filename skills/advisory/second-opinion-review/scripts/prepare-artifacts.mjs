#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workflow = "second-opinion-review";
const contextFileName = "pass-context.json";
const passContextSchemaVersion = 2;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const roles = new Set(["research", "rewrite", "check"]);
const passNamePattern = /^(\d{4}-\d{2}-\d{2})-(research|rewrite|check)-([a-z0-9]+(?:-[a-z0-9]+)*)-([A-Za-z0-9]{6})$/;
const passContextKeys = new Set([
  "schema_version",
  "workflow",
  "role",
  "slug",
  "pass_id",
  "pass_directory",
  "working_runs_root",
  "artifact_root",
  "resolution",
]);
const resolutionKeys = new Set([
  "kind",
  "context_root",
  "repository_root",
  "artifact_repository_root",
]);

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const observed = new Set(Object.keys(value));
  const missing = [...expected].filter((key) => !observed.has(key));
  const extra = [...observed].filter((key) => !expected.has(key));
  if (missing.length || extra.length) {
    const details = [
      missing.length ? `missing ${missing.join(", ")}` : "",
      extra.length ? `unsupported ${extra.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`${label} has invalid keys: ${details}`);
  }
  return value;
}

function existingDirectory(candidate, label) {
  let metadata;
  try {
    metadata = fs.statSync(candidate);
  } catch {
    throw new Error(`${label} must be an existing directory: ${candidate}`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`${label} must be an existing directory: ${candidate}`);
  }
  return fs.realpathSync(candidate);
}

function declaredContextRoot({ cwd, env }) {
  const declared = env.SECOND_OPINION_CONTEXT_ROOT;
  if (declared !== undefined) {
    if (typeof declared !== "string" || !path.isAbsolute(declared)) {
      throw new Error("SECOND_OPINION_CONTEXT_ROOT must be an absolute existing directory");
    }
    return existingDirectory(declared, "SECOND_OPINION_CONTEXT_ROOT");
  }
  return existingDirectory(path.resolve(cwd), "current working directory");
}

function detectRepositoryRoot(contextRoot) {
  const result = git(contextRoot, ["rev-parse", "--show-toplevel"]);
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return fs.realpathSync(result.stdout.trim());
}

function detectContainingRepository(candidate) {
  let existing = candidate;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return null;
    existing = parent;
  }
  if (!fs.statSync(existing).isDirectory()) existing = path.dirname(existing);
  const repositoryRoot = detectRepositoryRoot(fs.realpathSync(existing));
  return repositoryRoot && isInside(repositoryRoot, candidate) ? repositoryRoot : null;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function resolveProspectivePath(candidate) {
  let existing = candidate;
  const suffix = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...suffix);
}

function assertInsideRepository(repositoryRoot, candidate) {
  if (!isInside(repositoryRoot, candidate)) {
    throw new Error(".krn/runs must resolve inside the repository");
  }
}

function repositoryWorkingRuns(repositoryRoot) {
  const canonical = path.join(repositoryRoot, ".krn", "runs");
  const resolved = resolveProspectivePath(canonical);
  assertInsideRepository(repositoryRoot, resolved);
  if (resolved !== canonical) {
    throw new Error(".krn/runs must use its canonical repository path without symlinks");
  }
  return resolved;
}

function explicitWorkingRuns(env) {
  const declared = env.SECOND_OPINION_WORKING_RUNS;
  if (typeof declared !== "string" || !path.isAbsolute(declared)) {
    throw new Error(
      "no repository owns this context; SECOND_OPINION_WORKING_RUNS must be an absolute path",
    );
  }
  return resolveProspectivePath(path.resolve(declared));
}

function assertGitIgnored(repositoryRoot, candidate) {
  if (!repositoryRoot || !isInside(repositoryRoot, candidate)) return;
  const relative = path.relative(repositoryRoot, candidate);
  const result = git(repositoryRoot, ["check-ignore", "-q", "--no-index", "--", relative]);
  if (result.status !== 0) {
    throw new Error(`second-opinion working artifacts must be ignored by Git: ${candidate}`);
  }
}

export function resolveArtifactLayout({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const contextRoot = declaredContextRoot({ cwd, env });
  const repositoryRoot = detectRepositoryRoot(contextRoot);
  const resolutionKind = repositoryRoot ? "repository" : "explicit-working-runs";
  const workingRunsRoot = repositoryRoot
    ? repositoryWorkingRuns(repositoryRoot)
    : explicitWorkingRuns(env);
  const artifactRoot = path.join(workingRunsRoot, workflow);
  const artifactRepositoryRoot = detectContainingRepository(artifactRoot);

  assertGitIgnored(artifactRepositoryRoot, artifactRoot);
  return {
    resolutionKind,
    contextRoot,
    repositoryRoot,
    artifactRepositoryRoot,
    workingRunsRoot,
    artifactRoot,
  };
}

export function resolveArtifactRoot(options = {}) {
  return resolveArtifactLayout(options).artifactRoot;
}

function ensureRealDirectory(target, label, { privateMode = false } = {}) {
  fs.mkdirSync(target, { recursive: true, mode: privateMode ? 0o700 : 0o755 });
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
  if (privateMode) fs.chmodSync(target, 0o700);
  return fs.realpathSync(target);
}

function requireRole(role, label = "role") {
  if (!roles.has(role)) {
    throw new Error(`${label} must be research, rewrite, or check`);
  }
  return role;
}

function writePassContext(passDirectory, layout, { slug, role }) {
  const value = {
    schema_version: passContextSchemaVersion,
    workflow,
    role,
    slug,
    pass_id: path.basename(passDirectory),
    pass_directory: passDirectory,
    working_runs_root: layout.workingRunsRoot,
    artifact_root: layout.artifactRoot,
    resolution: {
      kind: layout.resolutionKind,
      context_root: layout.contextRoot,
      repository_root: layout.repositoryRoot,
      artifact_repository_root: layout.artifactRepositoryRoot,
    },
  };
  fs.writeFileSync(
    path.join(passDirectory, contextFileName),
    `${JSON.stringify(value, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
}

export function prepareArtifactDirectory({
  slug,
  role,
  cwd = process.cwd(),
  env = process.env,
  now = new Date(),
} = {}) {
  if (!slugPattern.test(slug ?? "")) {
    throw new Error("slug must use lowercase letters, digits, and single hyphens");
  }
  requireRole(role);

  const layout = resolveArtifactLayout({ cwd, env });
  ensureRealDirectory(layout.workingRunsRoot, "working runs root");
  const artifactRoot = ensureRealDirectory(
    layout.artifactRoot,
    "artifact root",
    { privateMode: true },
  );
  if (artifactRoot !== layout.artifactRoot) {
    throw new Error("artifact root changed while it was being prepared");
  }
  assertGitIgnored(layout.artifactRepositoryRoot, artifactRoot);

  const date = now.toISOString().slice(0, 10);
  const passDirectory = fs.mkdtempSync(
    path.join(artifactRoot, `${date}-${role}-${slug}-`),
  );
  fs.chmodSync(passDirectory, 0o700);
  try {
    writePassContext(passDirectory, layout, { slug, role });
    verifyPassDirectory({ passDirectory, expectedRole: role, env });
    return passDirectory;
  } catch (error) {
    fs.rmSync(passDirectory, { recursive: true, force: true });
    throw error;
  }
}

function readPassContext(passDirectory) {
  const contextPath = path.join(passDirectory, contextFileName);
  let metadata;
  try {
    metadata = fs.lstatSync(contextPath);
  } catch {
    throw new Error(`pass context is missing: ${contextPath}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("pass-context.json must be a real file");
  }
  if ((metadata.mode & 0o777) !== 0o600) {
    throw new Error("pass-context.json must use mode 0600");
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(contextPath, "utf8"));
  } catch {
    throw new Error("pass-context.json must contain valid JSON");
  }
  exactKeys(value, passContextKeys, "pass context");
  exactKeys(value.resolution, resolutionKeys, "pass context resolution");
  return value;
}

function assertOptionalEnvironmentContext(value, env) {
  if (env.SECOND_OPINION_CONTEXT_ROOT !== undefined) {
    const currentContext = declaredContextRoot({
      cwd: value.resolution.context_root,
      env,
    });
    if (value.resolution.repository_root) {
      if (detectRepositoryRoot(currentContext) !== value.resolution.repository_root) {
        throw new Error("SECOND_OPINION_CONTEXT_ROOT resolves to a different repository");
      }
    } else if (currentContext !== value.resolution.context_root) {
      throw new Error("SECOND_OPINION_CONTEXT_ROOT differs from the pass context");
    }
  }
  if (
    value.resolution.kind === "explicit-working-runs" &&
    env.SECOND_OPINION_WORKING_RUNS !== undefined &&
    explicitWorkingRuns(env) !== value.working_runs_root
  ) {
    throw new Error("SECOND_OPINION_WORKING_RUNS differs from the pass context");
  }
}

export function verifyPassDirectory({
  passDirectory,
  expectedRole,
  env = process.env,
} = {}) {
  if (typeof passDirectory !== "string" || !path.isAbsolute(passDirectory)) {
    throw new Error("pass directory must be an absolute path");
  }
  if (expectedRole !== undefined) requireRole(expectedRole, "expected role");

  let passStat;
  try {
    passStat = fs.lstatSync(passDirectory);
  } catch {
    throw new Error(`pass directory does not exist: ${passDirectory}`);
  }
  if (!passStat.isDirectory() || passStat.isSymbolicLink()) {
    throw new Error("pass directory must be a real directory, not a symlink");
  }
  if ((passStat.mode & 0o777) !== 0o700) {
    throw new Error("pass directory must use mode 0700");
  }
  const resolvedPass = fs.realpathSync(passDirectory);
  if (path.resolve(passDirectory) !== resolvedPass) {
    throw new Error("pass directory must use its canonical absolute path");
  }

  const match = path.basename(resolvedPass).match(passNamePattern);
  if (!match) {
    throw new Error("pass directory name must match date-role-slug-suffix");
  }
  const [, , nameRole, nameSlug] = match;
  if (expectedRole !== undefined && nameRole !== expectedRole) {
    throw new Error(`pass role ${nameRole} does not match expected role ${expectedRole}`);
  }

  const artifactRoot = path.dirname(resolvedPass);
  const workingRunsRoot = path.dirname(artifactRoot);
  if (path.basename(artifactRoot) !== workflow) {
    throw new Error(`pass directory must be a direct child of ${workflow}`);
  }
  const artifactStat = fs.lstatSync(artifactRoot);
  if (!artifactStat.isDirectory() || artifactStat.isSymbolicLink()) {
    throw new Error("artifact root must be a real directory, not a symlink");
  }
  if ((artifactStat.mode & 0o777) !== 0o700) {
    throw new Error("artifact root must use mode 0700");
  }
  const workingStat = fs.lstatSync(workingRunsRoot);
  if (!workingStat.isDirectory() || workingStat.isSymbolicLink()) {
    throw new Error("working runs root must be a real directory, not a symlink");
  }

  const value = readPassContext(resolvedPass);
  if (
    value.schema_version !== passContextSchemaVersion ||
    value.workflow !== workflow
  ) {
    throw new Error("pass context schema or workflow is unsupported");
  }
  requireRole(value.role, "pass context role");
  if (!slugPattern.test(value.slug ?? "")) {
    throw new Error("pass context slug is invalid");
  }
  if (
    value.role !== nameRole ||
    value.slug !== nameSlug ||
    value.pass_id !== path.basename(resolvedPass) ||
    value.pass_directory !== resolvedPass ||
    value.artifact_root !== artifactRoot ||
    value.working_runs_root !== workingRunsRoot
  ) {
    throw new Error("pass context does not match its directory layout");
  }
  if (expectedRole !== undefined && value.role !== expectedRole) {
    throw new Error(`pass role ${value.role} does not match expected role ${expectedRole}`);
  }

  const resolution = value.resolution;
  if (!new Set(["repository", "explicit-working-runs"]).has(resolution.kind)) {
    throw new Error("pass context resolution kind is invalid");
  }
  if (typeof resolution.context_root !== "string" || !path.isAbsolute(resolution.context_root)) {
    throw new Error("pass context context_root must be absolute");
  }
  const currentContextRoot = existingDirectory(
    resolution.context_root,
    "pass context context_root",
  );
  if (currentContextRoot !== resolution.context_root) {
    throw new Error("pass context context_root is not canonical");
  }
  const currentRepositoryRoot = detectRepositoryRoot(currentContextRoot);
  if (currentRepositoryRoot !== resolution.repository_root) {
    throw new Error("pass context repository identity changed");
  }
  const currentArtifactRepositoryRoot = detectContainingRepository(artifactRoot);
  if (currentArtifactRepositoryRoot !== resolution.artifact_repository_root) {
    throw new Error("pass context artifact repository identity changed");
  }

  if (resolution.kind === "repository") {
    if (!resolution.repository_root) {
      throw new Error("repository pass context is incomplete");
    }
    if (
      repositoryWorkingRuns(resolution.repository_root) !== workingRunsRoot ||
      resolution.artifact_repository_root !== resolution.repository_root
    ) {
      throw new Error("pass is outside the repository's canonical .krn/runs root");
    }
  } else {
    if (resolution.repository_root !== null) {
      throw new Error("explicit working-runs context must not claim a repository owner");
    }
  }

  assertOptionalEnvironmentContext(value, env);
  assertGitIgnored(resolution.artifact_repository_root, artifactRoot);
  return {
    passDirectory: resolvedPass,
    role: value.role,
    slug: value.slug,
    workingRunsRoot,
    artifactRoot,
    context: value,
  };
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

export function listPasses({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const { artifactRoot } = resolveArtifactLayout({ cwd, env });
  if (!fs.existsSync(artifactRoot)) return [];
  const passes = [];
  for (const entry of fs.readdirSync(artifactRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const passDirectory = path.join(artifactRoot, entry.name);
    try {
      const verified = verifyPassDirectory({ passDirectory, env });
      passes.push({
        role: verified.role,
        pass: entry.name,
        path: passDirectory,
        state: readJobState(passDirectory) ?? "unknown",
      });
    } catch (error) {
      passes.push({
        role: "invalid",
        pass: entry.name,
        path: passDirectory,
        state: `invalid: ${error.message}`,
      });
    }
  }
  passes.sort((a, b) => a.pass.localeCompare(b.pass));
  return passes;
}

function usage() {
  return [
    "usage: prepare-artifacts.mjs <lowercase-pass-slug> <research|rewrite|check>",
    "   or: prepare-artifacts.mjs list",
    "   or: prepare-artifacts.mjs verify-pass <absolute-pass-dir> [role]",
  ].join("\n");
}

function main(argv) {
  if (argv[0] === "list") {
    if (argv.length !== 1) throw new Error(usage());
    const passes = listPasses();
    if (!passes.length) {
      process.stdout.write("(no passes found under the artifact root)\n");
      return;
    }
    process.stdout.write("role\tpass\tstate\n");
    for (const pass of passes) {
      process.stdout.write(`${pass.role}\t${pass.pass}\t${pass.state}\n`);
    }
    return;
  }

  if (argv[0] === "verify-pass") {
    if (argv.length < 2 || argv.length > 3) throw new Error(usage());
    const verified = verifyPassDirectory({
      passDirectory: argv[1],
      expectedRole: argv[2],
    });
    process.stdout.write(`valid second-opinion pass: ${verified.passDirectory}\n`);
    return;
  }

  if (argv.length !== 2) throw new Error(usage());
  process.stdout.write(
    `${prepareArtifactDirectory({ slug: argv[0], role: argv[1] })}\n`,
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
