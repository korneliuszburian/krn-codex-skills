import { execFileSync, spawnSync } from "node:child_process";
import { gitText as git } from "./git-cli.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXIT_CODES } from "./diagnostics.mjs";
import { isSafeRelativePath as safeRelativePath } from "./path-rules.mjs";

const { USAGE: EXIT_USAGE, SOURCE: EXIT_SOURCE, CORRUPT: EXIT_CORRUPT, COLLISION: EXIT_COLLISION } = EXIT_CODES;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function canonicalPath(candidate) {
  const suffix = [];
  let existing = path.resolve(candidate);
  while (!fs.existsSync(existing)) {
    suffix.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...suffix);
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

function resolveSource({ source, cwd = process.cwd() } = {}) {
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

export function declaredRuntimePaths(manifest) {
  if (!Array.isArray(manifest.runtime_paths) || manifest.runtime_paths.length === 0) {
    fail("manifest is missing runtime_paths", EXIT_SOURCE);
  }
  return [...manifest.runtime_paths].sort();
}

function runtimePaths(root, manifest) {
  const files = new Set(declaredRuntimePaths(manifest));
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
  if (tracked.split("\n").some((line) => /^(120000|160000) /.test(line))) {
    fail("manifest runtime closure must not contain symbolic links or gitlinks", EXIT_SOURCE);
  }
  return [...files].sort();
}

export function createInstallPlan({ source, cwd, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
  const resolved = resolveSource({ source, cwd });
  validateSource(resolved.root);
  const manifest = readJson(path.join(resolved.root, "skills", "manifest.json"));
  const releaseRoot = path.join(canonicalPath(codexHome), "krn");
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
  const add = (label, root, name, relative) => {
    const target = path.join(root, name);
    if (path.dirname(target) !== root || name === "." || name === "..") fail(`unsafe managed destination: ${name}`, EXIT_SOURCE);
    targets.push({ label, target, relative });
  };
  for (const skill of plan.manifest.skills) {
    add(`skill__${skill.name}`, skillDest, skill.name, skill.path);
  }
  for (const bin of plan.manifest.bins) {
    add(`bin__${bin.name}`, binDest, bin.name, bin.path);
  }
  targets.push({ label: "global__AGENTS.md", target: path.join(codexHome, "AGENTS.md"), relative: plan.manifest.global_agents });
  targets.push({ label: "global__hooks.json", target: path.join(codexHome, "hooks.json"), relative: plan.manifest.global_hooks });
  for (const hook of plan.manifest.global_hook_files) {
    add(`hook__${hook.name}`, path.join(codexHome, "hooks"), hook.name, hook.path);
  }
  return targets;
}

function legacyHookTargets(codexHome, manifest) {
  return (manifest?.legacy_global_hook_paths ?? [])
    .map((relative) => path.join(codexHome, relative))
    .filter((target) => fs.lstatSync(target, { throwIfNoEntry: false }));
}

function releaseManifest(releaseRoot, currentTarget) {
  const candidates = currentTarget ? [currentTarget] : [];
  try {
    const releases = path.join(releaseRoot, "releases");
    for (const entry of fs.readdirSync(releases, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(releases, entry.name));
    }
  } catch {
    // no releases yet; legacy detection falls back to nothing
  }
  for (const directory of candidates) {
    const file = path.join(directory, "skills", "manifest.json");
    if (fs.existsSync(file)) {
      try { return readJson(file); } catch { return null; }
    }
  }
  return null;
}

function resolvedLink(target) {
  if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) return null;
  return resolvedPath(target);
}

function resolvedPath(target) {
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
  if (segments.length <= 1 || segments.slice(1).join(path.sep) !== item.relative) return false;
  try { verifyRelease(path.join(releases, segments[0]), segments[0]); return true; } catch { return false; }
}

function preflightCurrent(plan) {
  const stat = fs.lstatSync(plan.current, { throwIfNoEntry: false });
  if (!stat) return;
  const linked = resolvedLink(plan.current);
  const releases = path.join(plan.releaseRoot, "releases");
  if (!linked || path.dirname(linked) !== releases) {
    fail(`refusing foreign current binding: ${plan.current}`, EXIT_COLLISION);
  }
  verifyRelease(linked, path.basename(linked));
}

export function classifyTarget(plan, item, linked) {
  const expectedSource = plan.source ? path.join(plan.source, item.relative) : null;
  const legacySource = item.label === "bin__krn-codex-catalog" && plan.source
    ? path.join(plan.source, "scripts/catalog.mjs")
    : null;
  if (expectedSource && (linked === expectedSource || linked === legacySource)) return "legacy_source";
  const expectedCurrent = resolvedPath(stableTarget(plan, item));
  if (expectedCurrent && linked === expectedCurrent) return "current";
  if (isInside(plan.releaseRoot, linked)) {
    return isPriorReleasePath(plan, item, linked) ? "prior_release" : "other_release";
  }
  const sourceRoot = git(path.dirname(linked), ["rev-parse", "--show-toplevel"]);
  if (sourceRoot && plan.source && path.resolve(sourceRoot) === path.resolve(plan.source) && path.relative(sourceRoot, linked) === item.relative) return "legacy_source";
  return "foreign";
}

function preflightTargets(plan) {
  preflightCurrent(plan);
  const override = path.join(path.dirname(plan.releaseRoot), "AGENTS.override.md");
  if (fs.lstatSync(override, { throwIfNoEntry: false })) {
    fail(`refusing masked global instructions: ${override}`, EXIT_COLLISION);
  }
  for (const legacy of legacyHookTargets(path.dirname(plan.releaseRoot), plan.manifest)) {
    fail(`refusing legacy global hook path: ${legacy}`, EXIT_COLLISION);
  }
  for (const item of managedTargets(plan)) {
    const parent = path.dirname(item.target);
    const stat = fs.lstatSync(parent, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) fail(`refusing symlinked managed destination root: ${parent}`, EXIT_COLLISION);
    if (stat && !stat.isDirectory()) fail(`refusing non-directory managed destination root: ${parent}`, EXIT_COLLISION);
  }
  for (const item of managedTargets(plan)) {
    const stat = fs.lstatSync(item.target, { throwIfNoEntry: false });
    if (!stat) continue;
    const linked = resolvedLink(item.target);
    const kind = linked ? classifyTarget(plan, item, linked) : "foreign";
    if (kind === "legacy_source" || kind === "current" || kind === "prior_release") continue;
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
      const entry = { target: item.target, backup: null, created: false };
      changed.push(entry);
      if (fs.lstatSync(item.target, { throwIfNoEntry: false })) {
        fs.mkdirSync(backup, { recursive: true });
        entry.backup = path.join(backup, item.label);
        fs.renameSync(item.target, entry.backup);
        usedBackup = true;
      }
      fs.symlinkSync(expected, item.target);
      entry.created = true;
      if (process.env.KRN_TEST_FAIL_DURING_RECONCILE === "1" && changed.length === 1) {
        throw new Error("injected reconciliation failure");
      }
    }
  } catch (error) {
    for (const entry of changed.reverse()) {
      const current = fs.lstatSync(entry.target, { throwIfNoEntry: false });
      if (entry.created && current?.isSymbolicLink()) fs.unlinkSync(entry.target);
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
      fs.rmSync(staging, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    } else {
      fs.renameSync(staging, plan.release);
    }
  } catch (error) {
    if (fs.lstatSync(staging, { throwIfNoEntry: false })) {
      fs.rmSync(staging, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
    throw error;
  }
  verifyRelease(plan.release, plan.commit);
  const previous = resolvedLink(plan.current);
  replaceCurrent(plan, plan.release);
  try {
    verifyInstalledCli(plan);
    const backup = reconcileTargets(plan);
    return { ...plan, backup, idempotent: Boolean(previous === plan.release) };
  } catch (error) {
    restoreCurrent(plan, previous);
    throw error;
  }
}

function verifyInstalledCli(plan) {
  const entry = path.join(plan.current, "scripts", "krn-codex.mjs");
  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  if (result.status !== EXIT_USAGE) {
    const detail = `${result.stderr || result.stdout || ""}`.split("\n").find((line) => line.trim()) ?? "no output";
    fail(`installed CLI smoke failed (exit ${result.status ?? "signal"}): ${detail}`, EXIT_CORRUPT);
  }
}

function itemStatus(plan, item) {
  const stat = fs.lstatSync(item.target, { throwIfNoEntry: false });
  if (!stat) return { target: item.target, status: "missing" };
  if (!stat.isSymbolicLink()) return { target: item.target, status: "foreign_collision" };
  const linked = resolvedLink(item.target);
  if (!linked) return { target: item.target, status: "broken_link" };
  const kind = classifyTarget(plan, item, linked);
  const status = kind === "current"
    ? "filesystem_installed"
    : kind === "prior_release" || kind === "other_release"
      ? "stable_link_bypasses_current"
      : kind === "legacy_source"
        ? "legacy_mutable_source"
        : "foreign_collision";
  return { target: item.target, status };
}

export function inspectInstall({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
  const releaseRoot = path.join(canonicalPath(codexHome), "krn");
  const current = path.join(releaseRoot, "current");
  const override = path.join(path.dirname(releaseRoot), "AGENTS.override.md");
  const overridePresent = Boolean(fs.lstatSync(override, { throwIfNoEntry: false }));
  const currentTarget = resolvedLink(current);
  const manifest = releaseManifest(releaseRoot, currentTarget);
  const legacyHooks = legacyHookTargets(path.dirname(releaseRoot), manifest);
  const base = {
    releaseRoot,
    current,
    legacyHooks,
    session: { status: "session_loaded_unknown" },
    sessionAfterApply: { status: "stale_session_likely" },
  };
  if (!currentTarget) {
    const currentStat = fs.lstatSync(current, { throwIfNoEntry: false });
    return {
      ...base,
      filesystem: {
        status: overridePresent
          ? "masked_by_override"
          : legacyHooks.length > 0
            ? "legacy_hook_conflict"
            : currentStat && !currentStat.isSymbolicLink() ? "foreign_collision" : currentStat ? "broken_link" : "missing",
        ...(overridePresent ? { detail: override } : legacyHooks.length > 0 ? { detail: legacyHooks.join(", ") } : {}),
      },
      targets: [],
    };
  }
  let metadata;
  try { metadata = verifyRelease(currentTarget, path.basename(currentTarget)); }
  catch (error) { return { ...base, filesystem: { status: "broken_link", detail: error.message }, targets: [] }; }
  const plan = { releaseRoot, current, manifest, source: "", release: currentTarget };
  const targets = managedTargets(plan).map((item) => itemStatus(plan, item));
  const bad = targets.find((item) => item.status !== "filesystem_installed");
  return {
    ...base,
    commit: metadata.commit,
    legacyHooks,
    filesystem: overridePresent
      ? { status: "masked_by_override", detail: override }
      : legacyHooks.length > 0
        ? { status: "legacy_hook_conflict", detail: legacyHooks.join(", ") }
        : { status: bad ? bad.status : "filesystem_installed" },
    targets,
  };
}

export const installExitCodes = { EXIT_USAGE, EXIT_SOURCE, EXIT_CORRUPT, EXIT_COLLISION };
