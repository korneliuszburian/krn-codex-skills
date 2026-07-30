#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadCampaign } from "./research-campaign.mjs";

const workflow = "second-opinion-review";
const contextFileName = "pass-context.json";
const passContextSchemaVersion = 3;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const roles = new Set(["research", "rewrite", "check"]);
const passNamePattern = /^(\d{4}-\d{2}-\d{2})-(research|rewrite|check)-([a-z0-9]+(?:-[a-z0-9]+)*)-([A-Za-z0-9]{6})$/;
const passContextKeys = new Set([
  "schema_version",
  "workflow",
  "role",
  "slug",
  "pass_id",
  "resolution",
]);
const repositoryResolutionKeys = new Set([
  "kind",
  "context_path",
  "repository_anchor",
]);
const explicitResolutionKeys = new Set([
  "kind",
  "context_root",
  "working_runs_root",
  "artifact_repository_root",
]);
const legacyPassContextKeys = new Set([
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
const legacyResolutionKeys = new Set([
  "kind",
  "context_root",
  "repository_root",
  "artifact_repository_root",
  "config_path",
  "configured_working_runs",
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

function repositoryAnchor(repositoryRoot) {
  const result = git(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const anchor = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/.test(anchor)) {
    throw new Error("repository-owned passes require an immutable HEAD commit");
  }
  return anchor;
}

function assertRepositoryAnchor(repositoryRoot, anchor) {
  if (typeof anchor !== "string" || !/^[0-9a-f]{40,64}$/.test(anchor)) {
    throw new Error("pass context repository anchor is invalid");
  }
  const result = git(repositoryRoot, ["cat-file", "-e", `${anchor}^{commit}`]);
  if (result.status !== 0) {
    throw new Error("pass context repository identity changed");
  }
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

function repositoryRelativePath(repositoryRoot, candidate) {
  if (!isInside(repositoryRoot, candidate)) {
    throw new Error("pass context must stay inside its owning repository");
  }
  return path.relative(repositoryRoot, candidate) || ".";
}

function resolveRepositoryContext(repositoryRoot, contextPath) {
  if (
    typeof contextPath !== "string" ||
    !contextPath ||
    path.isAbsolute(contextPath) ||
    contextPath.split(path.sep).includes("..")
  ) {
    throw new Error("pass context repository context_path is invalid");
  }
  const contextRoot = existingDirectory(
    path.resolve(repositoryRoot, contextPath),
    "pass context repository context_path",
  );
  if (repositoryRelativePath(repositoryRoot, contextRoot) !== contextPath) {
    throw new Error("pass context repository context_path is not canonical");
  }
  if (detectRepositoryRoot(contextRoot) !== repositoryRoot) {
    throw new Error("pass context repository identity changed");
  }
  return contextRoot;
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
  const declaredRoot = declaredContextRoot({ cwd, env });
  const repositoryRoot = detectRepositoryRoot(declaredRoot);
  const contextRoot = repositoryRoot ?? declaredRoot;
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
  const resolution = layout.repositoryRoot
    ? {
        kind: "repository",
        context_path: repositoryRelativePath(layout.repositoryRoot, layout.contextRoot),
        repository_anchor: repositoryAnchor(layout.repositoryRoot),
      }
    : {
        kind: "explicit-working-runs",
        context_root: layout.contextRoot,
        working_runs_root: layout.workingRunsRoot,
        artifact_repository_root: layout.artifactRepositoryRoot,
      };
  const value = {
    schema_version: passContextSchemaVersion,
    workflow,
    role,
    slug,
    pass_id: path.basename(passDirectory),
    resolution,
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

function readPassContextValue(passDirectory) {
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
  return value;
}

function readPassContext(passDirectory) {
  const value = readPassContextValue(passDirectory);
  exactKeys(value, passContextKeys, "pass context");
  if (value.resolution?.kind === "repository") {
    exactKeys(value.resolution, repositoryResolutionKeys, "pass context resolution");
  } else if (value.resolution?.kind === "explicit-working-runs") {
    exactKeys(value.resolution, explicitResolutionKeys, "pass context resolution");
  } else {
    throw new Error("pass context resolution kind is invalid");
  }
  return value;
}

function canonicalPassLayout(passDirectory) {
  if (typeof passDirectory !== "string" || !path.isAbsolute(passDirectory)) {
    throw new Error("pass directory must be an absolute path");
  }

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
  return {
    resolvedPass,
    nameRole,
    nameSlug,
    artifactRoot,
    workingRunsRoot,
  };
}

function assertOptionalEnvironmentContext(
  value,
  env,
  { contextRoot, repositoryRoot, workingRunsRoot },
) {
  if (env.SECOND_OPINION_CONTEXT_ROOT !== undefined) {
    const currentContext = declaredContextRoot({
      cwd: contextRoot,
      env,
    });
    if (repositoryRoot) {
      if (
        detectRepositoryRoot(currentContext) !== repositoryRoot ||
        repositoryRelativePath(repositoryRoot, currentContext) !==
          value.resolution.context_path
      ) {
        throw new Error("SECOND_OPINION_CONTEXT_ROOT resolves to a different repository");
      }
    } else if (currentContext !== contextRoot) {
      throw new Error("SECOND_OPINION_CONTEXT_ROOT differs from the pass context");
    }
  }
  if (
    value.resolution.kind === "explicit-working-runs" &&
    env.SECOND_OPINION_WORKING_RUNS !== undefined &&
    explicitWorkingRuns(env) !== workingRunsRoot
  ) {
    throw new Error("SECOND_OPINION_WORKING_RUNS differs from the pass context");
  }
}

export function verifyPassDirectory({
  passDirectory,
  expectedRole,
  env = process.env,
} = {}) {
  if (expectedRole !== undefined) requireRole(expectedRole, "expected role");
  const {
    resolvedPass,
    nameRole,
    nameSlug,
    artifactRoot,
    workingRunsRoot,
  } = canonicalPassLayout(passDirectory);
  if (expectedRole !== undefined && nameRole !== expectedRole) {
    throw new Error(`pass role ${nameRole} does not match expected role ${expectedRole}`);
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
    value.pass_id !== path.basename(resolvedPass)
  ) {
    throw new Error("pass context does not match its directory layout");
  }
  if (expectedRole !== undefined && value.role !== expectedRole) {
    throw new Error(`pass role ${value.role} does not match expected role ${expectedRole}`);
  }

  const resolution = value.resolution;
  let currentContextRoot;
  let currentRepositoryRoot;
  let currentArtifactRepositoryRoot;
  if (resolution.kind === "repository") {
    currentRepositoryRoot = detectContainingRepository(artifactRoot);
    if (
      !currentRepositoryRoot ||
      repositoryWorkingRuns(currentRepositoryRoot) !== workingRunsRoot
    ) {
      throw new Error("pass is outside the repository's canonical .krn/runs root");
    }
    currentArtifactRepositoryRoot = currentRepositoryRoot;
    currentContextRoot = resolveRepositoryContext(
      currentRepositoryRoot,
      resolution.context_path,
    );
    assertRepositoryAnchor(currentRepositoryRoot, resolution.repository_anchor);
  } else {
    if (
      typeof resolution.context_root !== "string" ||
      !path.isAbsolute(resolution.context_root) ||
      typeof resolution.working_runs_root !== "string" ||
      !path.isAbsolute(resolution.working_runs_root)
    ) {
      throw new Error("explicit working-runs context must not claim a repository owner");
    }
    currentContextRoot = existingDirectory(
      resolution.context_root,
      "pass context context_root",
    );
    currentRepositoryRoot = detectRepositoryRoot(currentContextRoot);
    if (currentRepositoryRoot !== null) {
      throw new Error("explicit working-runs context must not claim a repository owner");
    }
    if (
      currentContextRoot !== resolution.context_root ||
      workingRunsRoot !== resolution.working_runs_root
    ) {
      throw new Error("pass context does not match its directory layout");
    }
    currentArtifactRepositoryRoot = detectContainingRepository(artifactRoot);
    if (currentArtifactRepositoryRoot !== resolution.artifact_repository_root) {
      throw new Error("pass context artifact repository identity changed");
    }
  }

  assertOptionalEnvironmentContext(value, env, {
    contextRoot: currentContextRoot,
    repositoryRoot: currentRepositoryRoot,
    workingRunsRoot,
  });
  assertGitIgnored(currentArtifactRepositoryRoot, artifactRoot);
  return {
    passDirectory: resolvedPass,
    role: value.role,
    slug: value.slug,
    workingRunsRoot,
    artifactRoot,
    context: value,
  };
}

function validJobIdentity(
  job,
  role,
  { legacy = false, campaignId, shardId } = {},
) {
  if (job.job_version !== "1") return false;
  if (role === "research") {
    return (
      job.campaign_id === campaignId &&
      job.shard_id === shardId
    );
  }
  if (role === "check") {
    return legacy
      ? new Set(["check", "checker"]).has(job.role)
      : job.role === "check";
  }
  return job.role === "rewrite";
}

function readJobState(passDirectory, role, options = {}) {
  const jobsDirectory = path.join(passDirectory, "jobs");
  const jobsStat = fs.lstatSync(jobsDirectory, { throwIfNoEntry: false });
  let expectedResearchJobs = null;
  let campaignId;
  if (role === "research") {
    const campaignFile = path.join(passDirectory, "campaign.json");
    const campaignStat = fs.lstatSync(campaignFile, { throwIfNoEntry: false });
    if (!campaignStat) return jobsStat ? "unreadable" : null;
    try {
      const loaded = loadCampaign(campaignFile);
      campaignId = loaded.campaign.campaign_id;
      expectedResearchJobs = new Map(
        loaded.campaign.shards.map((shard) => [
          `${shard.id}.job.json`,
          shard.id,
        ]),
      );
    } catch {
      return "unreadable";
    }
  }
  if (!jobsStat) return expectedResearchJobs ? "pending" : null;
  if (!jobsStat.isDirectory() || jobsStat.isSymbolicLink()) return "unreadable";
  const entries = fs
    .readdirSync(jobsDirectory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".job.json"));
  const states = [];
  const observedResearchJobs = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) return "unreadable";
    const expectedShardId = expectedResearchJobs?.get(entry.name);
    if (expectedResearchJobs && !expectedShardId) return "unreadable";
    try {
      const job = JSON.parse(
        fs.readFileSync(path.join(jobsDirectory, entry.name), "utf8"),
      );
      if (
        !job ||
        typeof job !== "object" ||
        Array.isArray(job) ||
        !validJobIdentity(job, role, {
          ...options,
          campaignId,
          shardId: expectedShardId,
        }) ||
        !new Set(["running", "complete", "failed"]).has(job.state)
      ) {
        return "unreadable";
      }
      states.push(job.state);
      if (expectedShardId) observedResearchJobs.add(entry.name);
    } catch {
      return "unreadable";
    }
  }
  if (states.length === 0) return expectedResearchJobs ? "pending" : null;
  if (states.includes("failed")) return "failed";
  if (states.includes("running")) return "running";
  if (
    expectedResearchJobs &&
    observedResearchJobs.size !== expectedResearchJobs.size
  ) {
    return "pending";
  }
  return states.every((state) => state === "complete") ? "complete" : "unreadable";
}

function absolutePathOrNull(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error(`${label} must be null or a canonical absolute path`);
  }
  return value;
}

export function inspectLegacyPass({ passDirectory } = {}) {
  const {
    resolvedPass,
    nameRole,
    nameSlug,
    artifactRoot,
    workingRunsRoot,
  } = canonicalPassLayout(passDirectory);
  const value = readPassContextValue(resolvedPass);
  exactKeys(value, legacyPassContextKeys, "legacy pass context");
  exactKeys(value.resolution, legacyResolutionKeys, "legacy pass context resolution");
  if (value.schema_version !== 1 || value.workflow !== workflow) {
    throw new Error("legacy pass context must use second-opinion-review schema 1");
  }
  requireRole(value.role, "legacy pass context role");
  if (!slugPattern.test(value.slug ?? "")) {
    throw new Error("legacy pass context slug is invalid");
  }
  absolutePathOrNull(value.pass_directory, "legacy pass_directory");
  absolutePathOrNull(value.artifact_root, "legacy artifact_root");
  absolutePathOrNull(value.working_runs_root, "legacy working_runs_root");
  if (
    value.role !== nameRole ||
    value.slug !== nameSlug ||
    value.pass_id !== path.basename(resolvedPass) ||
    path.basename(value.pass_directory ?? "") !== value.pass_id ||
    path.dirname(value.pass_directory ?? "") !== value.artifact_root ||
    path.basename(value.artifact_root ?? "") !== workflow ||
    path.dirname(value.artifact_root ?? "") !== value.working_runs_root
  ) {
    throw new Error("legacy pass context has inconsistent historical layout");
  }
  const relocated =
    value.pass_directory !== resolvedPass ||
    value.artifact_root !== artifactRoot ||
    value.working_runs_root !== workingRunsRoot;

  const resolution = value.resolution;
  if (!new Set(["repository-config", "explicit-working-runs"]).has(resolution.kind)) {
    throw new Error("legacy pass context resolution kind is invalid");
  }
  absolutePathOrNull(resolution.context_root, "legacy context_root");
  if (resolution.context_root === null) {
    throw new Error("legacy context_root must be a canonical absolute path");
  }
  absolutePathOrNull(resolution.repository_root, "legacy repository_root");
  absolutePathOrNull(
    resolution.artifact_repository_root,
    "legacy artifact_repository_root",
  );
  absolutePathOrNull(resolution.config_path, "legacy config_path");

  if (resolution.kind === "repository-config") {
    const configuredWorkingRuns =
      typeof resolution.configured_working_runs === "string"
        ? path.resolve(
            resolution.repository_root ?? path.parse(resolvedPass).root,
            resolution.configured_working_runs,
          )
        : null;
    if (
      !resolution.repository_root ||
      resolution.artifact_repository_root !== resolution.repository_root ||
      resolution.config_path !==
        path.join(resolution.repository_root, "docs", "agents", "artifact-paths.json") ||
      typeof resolution.configured_working_runs !== "string" ||
      !resolution.configured_working_runs ||
      path.isAbsolute(resolution.configured_working_runs) ||
      !configuredWorkingRuns ||
      !isInside(resolution.repository_root, configuredWorkingRuns) ||
      !isInside(resolution.repository_root, resolution.context_root) ||
      !isInside(resolution.repository_root, value.artifact_root) ||
      (!relocated && fs.existsSync(configuredWorkingRuns) &&
        resolveProspectivePath(configuredWorkingRuns) !== workingRunsRoot)
    ) {
      throw new Error("legacy configured pass context is inconsistent");
    }
  } else if (
    resolution.config_path !== null ||
    resolution.configured_working_runs !== null ||
    (resolution.repository_root &&
      !isInside(resolution.repository_root, resolution.context_root)) ||
    (resolution.artifact_repository_root &&
      !isInside(resolution.artifact_repository_root, value.artifact_root))
  ) {
    throw new Error("legacy explicit pass context is inconsistent");
  }

  const currentArtifactRepositoryRoot = detectContainingRepository(artifactRoot);
  const historicalArtifactRepositoryRoot =
    resolution.kind === "repository-config"
      ? resolution.repository_root
      : resolution.artifact_repository_root;
  if (!relocated) {
    if (currentArtifactRepositoryRoot !== historicalArtifactRepositoryRoot) {
      throw new Error("legacy artifact repository identity changed");
    }
  } else if (historicalArtifactRepositoryRoot) {
    if (!currentArtifactRepositoryRoot) {
      throw new Error(
        "relocated legacy repository-owned artifacts must remain inside an owning repository",
      );
    }
    const historicalArtifactPath = repositoryRelativePath(
      historicalArtifactRepositoryRoot,
      value.artifact_root,
    );
    const currentArtifactPath = repositoryRelativePath(
      currentArtifactRepositoryRoot,
      artifactRoot,
    );
    if (currentArtifactPath !== historicalArtifactPath) {
      throw new Error(
        "relocated legacy artifacts must preserve their repository-relative path",
      );
    }
  } else if (currentArtifactRepositoryRoot) {
    throw new Error("relocated legacy artifact repository identity changed");
  }
  assertGitIgnored(currentArtifactRepositoryRoot, artifactRoot);
  return {
    kind: "legacy-v1-closure",
    schema_version: 1,
    workflow,
    role: value.role,
    pass: value.pass_id,
    path: resolvedPass,
    relocated,
    state: readJobState(resolvedPass, value.role, { legacy: true }) ?? "unknown",
    resumable: false,
  };
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
        state: readJobState(passDirectory, verified.role) ?? "unknown",
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
    "   or: prepare-artifacts.mjs inspect-legacy-pass <absolute-pass-dir>",
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

  if (argv[0] === "inspect-legacy-pass") {
    if (argv.length !== 2) throw new Error(usage());
    process.stdout.write(`${JSON.stringify(inspectLegacyPass({ passDirectory: argv[1] }))}\n`);
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
