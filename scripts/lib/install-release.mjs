import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXIT_USAGE = 64;
const EXIT_SOURCE = 65;
const EXIT_CORRUPT = 66;
const EXIT_COLLISION = 73;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function git(directory, args) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function safeRelativePath(candidate) {
  return typeof candidate === "string" &&
    candidate.length > 0 &&
    !path.isAbsolute(candidate) &&
    !candidate.split(/[\\/]/).includes("..") &&
    !candidate.includes("\\");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sourceRootFromLocator(locator, cwd) {
  const asPath = locator && fs.existsSync(locator) ? path.resolve(locator) : null;
  if (asPath) {
    const root = git(asPath, ["rev-parse", "--show-toplevel"]);
    if (!root) fail(`source is not a Git checkout: ${asPath}`, EXIT_SOURCE);
    return { root: fs.realpathSync(root), ref: "HEAD" };
  }
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) {
    fail("--source must name a clean Git checkout when krn-codex is run outside one", EXIT_USAGE);
  }
  return { root: fs.realpathSync(root), ref: locator || "HEAD" };
}

export function resolveSource({ source, cwd = process.cwd() } = {}) {
  const { root, ref } = sourceRootFromLocator(source, cwd);
  const commit = git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  const head = git(root, ["rev-parse", "--verify", "HEAD"]);
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=all"]);
  if (!commit || !head) fail(`cannot resolve source revision: ${ref}`, EXIT_SOURCE);
  if (dirty) fail(`source checkout is dirty: ${root}`, EXIT_SOURCE);
  if (commit !== head) {
    fail(`source ref must be the checked-out HEAD: ${ref} resolves to ${commit}, HEAD is ${head}`, EXIT_SOURCE);
  }
  return { root, commit };
}

function validateSource(root) {
  const validator = path.join(root, "scripts", "validate.mjs");
  if (!fs.existsSync(validator)) fail(`source lacks scripts/validate.mjs: ${root}`, EXIT_SOURCE);
  const result = spawnSync(process.execPath, [validator], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`source validation failed:\n${result.stdout}${result.stderr}`, EXIT_SOURCE);
  }
}

function runtimePaths(root, manifest) {
  const files = new Set([
    "skills/manifest.json",
    "config/capability-profiles.json",
    "scripts/install.sh",
    "scripts/krn-codex.mjs",
    "scripts/catalog.mjs",
    "scripts/frontend-browser-evidence.mjs",
    "scripts/frontend-browser-gate.mjs",
    "scripts/lib/catalog-config.mjs",
    "scripts/lib/catalog-inventory.mjs",
    "scripts/lib/catalog-path-safety.mjs",
    "scripts/lib/catalog-profile.mjs",
    "scripts/lib/catalog-usage.mjs",
    "scripts/lib/install-release.mjs",
  ]);
  for (const candidate of [manifest.global_agents, manifest.global_hooks]) files.add(candidate);
  for (const hook of manifest.global_hook_files) files.add(hook.path);
  for (const bin of manifest.bins) files.add(bin.path);
  for (const skill of manifest.skills) files.add(skill.path);
  for (const relative of files) {
    if (!safeRelativePath(relative) || !fs.existsSync(path.join(root, relative))) {
      fail(`manifest runtime path is absent or unsafe: ${relative}`, EXIT_SOURCE);
    }
  }
  const tracked = git(root, ["ls-tree", "-r", "--full-tree", "HEAD", "--", ...files]);
  if (!tracked) fail("manifest runtime closure has no tracked files", EXIT_SOURCE);
  if (tracked.split("\n").some((line) => line.startsWith("120000 "))) {
    fail("manifest runtime closure must not contain symbolic links", EXIT_SOURCE);
  }
  return [...files].sort();
}

export function createInstallPlan({ source, cwd, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
  const resolved = resolveSource({ source, cwd });
  validateSource(resolved.root);
  const manifest = readJson(path.join(resolved.root, "skills", "manifest.json"));
  const releaseRoot = path.join(path.resolve(codexHome), "krn");
  return {
    source: resolved.root,
    commit: resolved.commit,
    releaseRoot,
    release: path.join(releaseRoot, "releases", resolved.commit),
    current: path.join(releaseRoot, "current"),
    runtimePaths: runtimePaths(resolved.root, manifest),
    manifest,
  };
}

function digestTree(root) {
  const hash = crypto.createHash("sha256");
  const entries = [];
  function visit(relative = "") {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(relative, entry.name);
      if (next === ".krn-release.json") continue;
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile()) entries.push(next);
      else fail(`release contains unsupported filesystem entry: ${next}`, EXIT_CORRUPT);
    }
  }
  visit();
  for (const relative of entries) {
    const stat = fs.statSync(path.join(root, relative));
    hash.update(`${relative}\0${stat.mode & 0o111 ? "x" : "-"}\0`);
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: entries };
}

function releaseMetadata(release) {
  const file = path.join(release, ".krn-release.json");
  if (!fs.existsSync(file)) fail(`existing release lacks metadata: ${release}`, EXIT_CORRUPT);
  try {
    return readJson(file);
  } catch {
    fail(`existing release has invalid metadata: ${release}`, EXIT_CORRUPT);
  }
}

function verifyRelease(release, commit) {
  const stat = fs.lstatSync(release, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`existing release is not a regular directory: ${release}`, EXIT_CORRUPT);
  }
  const metadata = releaseMetadata(release);
  if (metadata.schemaVersion !== 1 || metadata.commit !== commit || typeof metadata.digest !== "string") {
    fail(`existing release metadata does not match ${commit}: ${release}`, EXIT_CORRUPT);
  }
  const actual = digestTree(release).digest;
  if (actual !== metadata.digest) fail(`existing release is corrupt: ${release}`, EXIT_CORRUPT);
  return metadata;
}

function copyRuntime(plan, staging) {
  // Git archive, rather than a filesystem copy, makes the release exactly the
  // resolved commit: ignored and untracked bytes can never cross the boundary.
  const archive = execFileSync("git", ["archive", "--format=tar", plan.commit, "--", ...plan.runtimePaths], {
    cwd: plan.source,
    maxBuffer: 32 * 1024 * 1024,
  });
  execFileSync("tar", ["-x", "-C", staging, "--no-same-owner"], { input: archive });
  const metadata = {
    schemaVersion: 1,
    commit: plan.commit,
    runtimePaths: plan.runtimePaths,
    source: "manifest-owned runtime closure",
  };
  metadata.digest = digestTree(staging).digest;
  fs.writeFileSync(path.join(staging, ".krn-release.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

function managedTargets(plan) {
  const skillDest = process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills");
  const binDest = process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin");
  const codexHome = path.dirname(plan.releaseRoot);
  const targets = [];
  for (const skill of plan.manifest.skills) {
    targets.push({ label: `skill__${skill.name}`, target: path.join(skillDest, skill.name), relative: skill.path });
  }
  for (const bin of plan.manifest.bins) {
    targets.push({ label: `bin__${bin.name}`, target: path.join(binDest, bin.name), relative: bin.path });
  }
  targets.push({ label: "global__AGENTS.md", target: path.join(codexHome, "AGENTS.md"), relative: plan.manifest.global_agents });
  targets.push({ label: "global__hooks.json", target: path.join(codexHome, "hooks.json"), relative: plan.manifest.global_hooks });
  for (const hook of plan.manifest.global_hook_files) {
    targets.push({ label: `hook__${hook.name}`, target: path.join(codexHome, "hooks", hook.name), relative: hook.path });
  }
  return targets;
}

function resolvedLink(target) {
  if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) return null;
  try { return fs.realpathSync(target); } catch { return null; }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function stableTarget(plan, item) {
  return path.join(plan.current, item.relative);
}

function isPriorReleasePath(plan, item, linked) {
  const releases = path.join(plan.releaseRoot, "releases");
  if (!isInside(releases, linked)) return false;
  const segments = path.relative(releases, linked).split(path.sep);
  return segments.length > 1 && segments.slice(1).join(path.sep) === item.relative;
}

function isTrustedLegacySource(plan, item, linked) {
  const root = git(path.dirname(linked), ["rev-parse", "--show-toplevel"]);
  if (!root || path.relative(root, linked) !== item.relative) return false;
  const expectedRemote = git(plan.source, ["remote", "get-url", "origin"]);
  return Boolean(expectedRemote && expectedRemote === git(root, ["remote", "get-url", "origin"]));
}

function preflightCurrent(plan) {
  const stat = fs.lstatSync(plan.current, { throwIfNoEntry: false });
  if (!stat) return;
  const linked = resolvedLink(plan.current);
  if (!linked || !isInside(path.join(plan.releaseRoot, "releases"), linked)) {
    fail(`refusing foreign current binding: ${plan.current}`, EXIT_COLLISION);
  }
}

function preflightTargets(plan) {
  preflightCurrent(plan);
  const override = path.join(path.dirname(plan.releaseRoot), "AGENTS.override.md");
  if (fs.lstatSync(override, { throwIfNoEntry: false })) {
    fail(`refusing masked global instructions: ${override}`, EXIT_COLLISION);
  }
  for (const item of managedTargets(plan)) {
    const stat = fs.lstatSync(item.target, { throwIfNoEntry: false });
    if (!stat) continue;
    const linked = resolvedLink(item.target);
    const expectedSource = path.join(plan.source, item.relative);
    const expectedCurrent = resolvedLink(stableTarget(plan, item));
    if (linked && (linked === expectedSource || linked === expectedCurrent || isPriorReleasePath(plan, item, linked) || isTrustedLegacySource(plan, item, linked))) continue;
    fail(`refusing foreign managed destination collision: ${item.target}`, EXIT_COLLISION);
  }
}

function replaceCurrent(plan, target) {
  fs.mkdirSync(plan.releaseRoot, { recursive: true });
  const temporary = path.join(plan.releaseRoot, `.current-${process.pid}-${Date.now()}`);
  fs.symlinkSync(path.relative(plan.releaseRoot, target), temporary);
  fs.renameSync(temporary, plan.current);
}

function restoreCurrent(plan, previous) {
  try {
    if (fs.lstatSync(plan.current, { throwIfNoEntry: false })) fs.unlinkSync(plan.current);
    if (previous) replaceCurrent(plan, previous);
  } catch {
    // The original failure remains more actionable; doctor will expose a broken state.
  }
}

function reconcileTargets(plan) {
  const backup = path.join(plan.releaseRoot, "migration-backups", `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`);
  let usedBackup = false;
  const changed = [];
  try {
    for (const item of managedTargets(plan)) {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      const expected = stableTarget(plan, item);
      const linked = resolvedLink(item.target);
      if (linked === fs.realpathSync(expected)) {
        const textual = fs.readlinkSync(item.target);
        if (textual.includes(`${path.sep}current${path.sep}`)) continue;
      }
      const entry = { target: item.target, backup: null };
      if (fs.lstatSync(item.target, { throwIfNoEntry: false })) {
        fs.mkdirSync(backup, { recursive: true });
        entry.backup = path.join(backup, item.label);
        fs.renameSync(item.target, entry.backup);
        usedBackup = true;
      }
      fs.symlinkSync(expected, item.target);
      changed.push(entry);
      if (process.env.KRN_TEST_FAIL_DURING_RECONCILE === "1" && changed.length === 1) {
        throw new Error("injected reconciliation failure");
      }
    }
  } catch (error) {
    for (const entry of changed.reverse()) {
      if (fs.lstatSync(entry.target, { throwIfNoEntry: false })) fs.unlinkSync(entry.target);
      if (entry.backup && fs.lstatSync(entry.backup, { throwIfNoEntry: false })) {
        fs.renameSync(entry.backup, entry.target);
      }
    }
    throw error;
  }
  return usedBackup ? backup : null;
}

export function applyInstall(plan) {
  preflightTargets(plan);
  fs.mkdirSync(path.dirname(plan.release), { recursive: true });
  const staging = fs.mkdtempSync(path.join(plan.releaseRoot, ".staging-"));
  try {
    const expected = copyRuntime(plan, staging);
    if (fs.lstatSync(plan.release, { throwIfNoEntry: false })) {
      const existing = verifyRelease(plan.release, plan.commit);
      if (existing.digest !== expected.digest || JSON.stringify(existing.runtimePaths) !== JSON.stringify(expected.runtimePaths)) {
        fail(`existing release does not match the resolved source: ${plan.release}`, EXIT_CORRUPT);
      }
      fs.rmSync(staging, { recursive: true, force: true });
    } else {
      fs.renameSync(staging, plan.release);
    }
  } catch (error) {
    if (fs.lstatSync(staging, { throwIfNoEntry: false })) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
  verifyRelease(plan.release, plan.commit);
  const previous = resolvedLink(plan.current);
  replaceCurrent(plan, plan.release);
  try {
    if (process.env.KRN_TEST_FAIL_AFTER_CURRENT === "1") throw new Error("injected post-current failure");
    const backup = reconcileTargets(plan);
    return { ...plan, backup, idempotent: Boolean(previous === plan.release) };
  } catch (error) {
    restoreCurrent(plan, previous);
    throw error;
  }
}

function itemStatus(plan, item) {
  const stat = fs.lstatSync(item.target, { throwIfNoEntry: false });
  if (!stat) return { target: item.target, status: "missing" };
  if (!stat.isSymbolicLink()) return { target: item.target, status: "foreign_collision" };
  const linked = resolvedLink(item.target);
  if (!linked) return { target: item.target, status: "broken_link" };
  if (isInside(plan.releaseRoot, linked)) {
    const text = fs.readlinkSync(item.target);
    return { target: item.target, status: text.includes(`${path.sep}current${path.sep}`) ? "filesystem_installed" : "stable_link_bypasses_current" };
  }
  return { target: item.target, status: "legacy_mutable_source" };
}

export function inspectInstall({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
  const releaseRoot = path.join(path.resolve(codexHome), "krn");
  const current = path.join(releaseRoot, "current");
  const currentTarget = resolvedLink(current);
  const base = {
    releaseRoot,
    current,
    session: { status: "session_loaded_unknown" },
    sessionAfterApply: { status: "stale_session_likely" },
  };
  if (!currentTarget) {
    const currentStat = fs.lstatSync(current, { throwIfNoEntry: false });
    return { ...base, filesystem: { status: currentStat && !currentStat.isSymbolicLink() ? "foreign_collision" : currentStat ? "broken_link" : "missing" }, targets: [] };
  }
  let metadata;
  try { metadata = verifyRelease(currentTarget, path.basename(currentTarget)); }
  catch (error) { return { ...base, filesystem: { status: "broken_link", detail: error.message }, targets: [] }; }
  const manifest = readJson(path.join(currentTarget, "skills", "manifest.json"));
  const plan = { releaseRoot, current, manifest, source: "", release: currentTarget };
  const targets = managedTargets(plan).map((item) => itemStatus(plan, item));
  const bad = targets.find((item) => item.status !== "filesystem_installed");
  return {
    ...base,
    commit: metadata.commit,
    filesystem: { status: bad ? bad.status : "filesystem_installed" },
    targets,
  };
}

export const installExitCodes = { EXIT_USAGE, EXIT_SOURCE, EXIT_CORRUPT, EXIT_COLLISION };
