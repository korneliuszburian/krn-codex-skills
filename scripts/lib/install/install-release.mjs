import { execFileSync, spawnSync } from "node:child_process";
import { gitText as git, runGitRaw } from "../support/git-cli.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { isSafeRelativePath as safeRelativePath } from "../support/path-rules.mjs";
import { readJson } from "../support/read-json.mjs";

import {
  canonicalPath,
  classifyTarget,
  digestTree,
  inspectInstall,
  legacyHookTargets,
  managedHookPolicy,
  managedTargets,
  orphanManagedLinks,
  pruneReleases,
  resolvedLink,
  stableTarget,
  verifyRelease,
} from "./install-inspect.mjs";
import { sealRelease, sealReleaseDigest } from "./install-seal.mjs";

const { USAGE: EXIT_USAGE, SOURCE: EXIT_SOURCE, CORRUPT: EXIT_CORRUPT, COLLISION: EXIT_COLLISION } = EXIT_CODES;

export { classifyTarget, inspectInstall, managedHookPolicy, managedTargets, pruneReleases };

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
  const status = runGitRaw(root, ["status", "--porcelain", "--untracked-files=all"]);
  if (!commit || !head) fail(`cannot resolve source revision: ${ref}`, EXIT_SOURCE);
  if (!status.ok) fail(`source checkout status is unreadable: ${root}`, EXIT_SOURCE);
  if (status.out.trim() !== "") fail(`source checkout is dirty: ${root}`, EXIT_SOURCE);
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
  for (const hook of Array.isArray(manifest.global_hook_files) ? manifest.global_hook_files : []) files.add(hook.path);
  for (const bin of Array.isArray(manifest.bins) ? manifest.bins : []) files.add(bin.path);
  for (const skill of Array.isArray(manifest.skills) ? manifest.skills : []) files.add(skill.path);
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

export function sealCurrentRelease({ source, cwd, codexHome } = {}) {
  const plan = createInstallPlan({ source, cwd, codexHome });
  const sealed = sealRelease({ release: plan.release, commit: plan.commit });
  const ledger = sealReleaseDigest({ root: plan.source, commit: plan.commit, digest: sealed.digest });
  return { commit: plan.commit, release: plan.release, digest: sealed.digest, ledger: ledger.file };
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
  sealReleaseDigest({ root: staging, commit: plan.commit, digest: metadata.digest });
  fs.writeFileSync(path.join(staging, ".krn-release.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
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
    for (const target of orphanManagedLinks(plan)) {
      const entry = { target, backup: null, created: false };
      changed.push(entry);
      fs.mkdirSync(backup, { recursive: true });
      entry.backup = path.join(backup, `orphan__${changed.length}__${path.basename(target)}`);
      fs.renameSync(target, entry.backup);
      usedBackup = true;
    }
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
  return { backup: usedBackup ? backup : null, reconciled: changed.length > 0 };
}

export function applyInstall(plan) {
  preflightTargets(plan);
  for (const dir of [plan.releaseRoot, path.join(plan.releaseRoot, "releases")]) {
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      fail(`release store root must be a real directory, not a symlink: ${dir}`, EXIT_CORRUPT);
    }
  }
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
    const { backup, reconciled } = reconcileTargets(plan);
    return { ...plan, backup, idempotent: Boolean(previous === plan.release) && !reconciled };
  } catch (error) {
    restoreCurrent(plan, previous);
    throw error;
  }
}

function verifyInstalledCli(plan) {
  const entry = path.join(plan.current, "scripts", "krn-codex.mjs");
  // A hung entry once blocked the installer for minutes and left a teardown
  // race behind (2026-09-16 CI flakes), so the smoke is time-bounded;
  // KRN_SMOKE_TIMEOUT_MS only shortens the bound for tests.
  const configured = Number(process.env.KRN_SMOKE_TIMEOUT_MS);
  const timeout = Number.isFinite(configured) && configured > 0 ? configured : 15000;
  const result = spawnSync(process.execPath, [entry], { encoding: "utf8", timeout, killSignal: "SIGKILL" });
  if (result.error?.code === "ETIMEDOUT" || result.signal) {
    const reason =
      result.error?.code === "ETIMEDOUT" ? `timed out after ${timeout}ms` : `terminated by signal ${result.signal}`;
    fail(`installed CLI smoke ${reason}`, EXIT_CORRUPT);
  }
  if (result.status !== EXIT_USAGE) {
    const detail = `${result.stderr || result.stdout || ""}`.split("\n").find((line) => line.trim()) ?? "no output";
    fail(`installed CLI smoke failed (exit ${result.status ?? "signal"}): ${detail}`, EXIT_CORRUPT);
  }
}
