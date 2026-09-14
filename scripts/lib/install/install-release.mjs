import { execFileSync, spawnSync } from "node:child_process";
import { gitText as git, runGitRaw } from "../support/git-cli.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fileURLToPath } from "node:url";

import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { isInside, isSafeRelativePath as safeRelativePath } from "../support/path-rules.mjs";
import { readJson } from "../support/read-json.mjs";
import { parseAssignment, parseDocument, parseDottedHeaderKey, parseTomlString, splitHeader } from "../catalog/catalog-toml.mjs";

const { USAGE: EXIT_USAGE, SOURCE: EXIT_SOURCE, CORRUPT: EXIT_CORRUPT, COLLISION: EXIT_COLLISION } = EXIT_CODES;

const OWN_MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "skills", "manifest.json");

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

function stableTarget(plan, item) {
  return path.join(plan.current, item.relative);
}

function isPriorReleasePath(plan, item, linked) {
  const releases = path.join(plan.releaseRoot, "releases");
  if (!isInside(releases, linked)) return false;
  const segments = path.relative(releases, linked).split(path.sep);
  if (segments.length <= 1) return false;
  const relative = segments.slice(1).join(path.sep);
  const legacy = item.label === "bin__krn-codex-catalog" ? "scripts/catalog.mjs" : null;
  if (relative !== item.relative && relative !== legacy) return false;
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
  const linkedRelative = sourceRoot ? path.relative(sourceRoot, linked) : null;
  const legacyRelative = item.label === "bin__krn-codex-catalog" ? "scripts/catalog.mjs" : null;
  if (
    sourceRoot
    && (linkedRelative === item.relative || linkedRelative === legacyRelative)
    && (plan.source
      ? path.resolve(sourceRoot) === path.resolve(plan.source)
      : plan.allowLegacySource === true && fs.existsSync(path.join(sourceRoot, "scripts", "krn-codex.mjs")))
  ) {
    return "legacy_source";
  }
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

function linkResolvesInto(target, root) {
  let textual;
  try { textual = fs.readlinkSync(target); } catch { return false; }
  const absolute = path.isAbsolute(textual) ? textual : path.resolve(path.dirname(target), textual);
  return isInside(root, absolute);
}

function orphanManagedLinks(plan) {
  const roots = [
    process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills"),
    process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin"),
    path.join(path.dirname(plan.releaseRoot), "hooks"),
  ];
  const managed = new Set(managedTargets(plan).map((item) => item.target));
  const orphans = [];
  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(root, entry.name);
      if (managed.has(target) || !entry.isSymbolicLink()) continue;
      if (linkResolvesInto(target, plan.releaseRoot)) orphans.push(target);
    }
  }
  return orphans;
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
  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  if (result.status !== EXIT_USAGE) {
    const detail = `${result.stderr || result.stdout || ""}`.split("\n").find((line) => line.trim()) ?? "no output";
    fail(`installed CLI smoke failed (exit ${result.status ?? "signal"}): ${detail}`, EXIT_CORRUPT);
  }
}

function itemStatus(plan, item) {
  const parentStat = fs.lstatSync(path.dirname(item.target), { throwIfNoEntry: false });
  if (parentStat && (parentStat.isSymbolicLink() || !parentStat.isDirectory())) {
    return { target: item.target, status: "foreign_collision" };
  }
  const stat = fs.lstatSync(item.target, { throwIfNoEntry: false });
  if (!stat) return { target: item.target, status: "missing" };
  if (!stat.isSymbolicLink()) return { target: item.target, status: "foreign_collision" };
  const linked = resolvedLink(item.target);
  if (!linked) return { target: item.target, status: "broken_link" };
  const kind = classifyTarget(plan, item, linked);
  const status = kind === "current"
    ? "filesystem_installed"
    : kind === "prior_release"
      ? "stable_link_bypasses_current"
      : kind === "legacy_source"
        ? "legacy_mutable_source"
        : "foreign_collision";
  return { target: item.target, status };
}

function defaultRequirementsPath(env = process.env) {
  if (process.platform === "win32") {
    return path.join(env.ProgramData || "C:\\ProgramData", "OpenAI", "Codex", "requirements.toml");
  }
  return "/etc/codex/requirements.toml";
}

function tomlBoolean(value) {
  const token = String(value ?? "").replace(/#.*$/, "").trim();
  if (token === "true") return true;
  if (token === "false") return false;
  return null;
}

function topLevelEquals(part) {
  let quote = null;
  for (let index = 0; index < part.length; index += 1) {
    const char = part[index];
    if (quote) {
      if (quote === "\"" && char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") quote = char;
    else if (char === "=") return index;
  }
  return -1;
}

function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (quote) {
      current += char;
      if (quote === "\"" && char === "\\") {
        current += inner[index + 1] ?? "";
        index += 1;
      } else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; current += char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

function inlineTableValue(value) {
  const raw = String(value ?? "").trimEnd();
  if (!raw.startsWith("{")) return null;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (quote === "\"" && char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) {
      const map = new Map();
      for (const part of splitTopLevel(raw.slice(1, index))) {
        const eq = topLevelEquals(part);
        if (eq === -1) continue;
        const keyToken = part.slice(0, eq).trim();
        let key = keyToken;
        if ((keyToken.startsWith("\"") && keyToken.endsWith("\"")) || (keyToken.startsWith("'") && keyToken.endsWith("'"))) {
          try { key = parseTomlString(keyToken, "requirements.toml inline key"); } catch { key = keyToken.slice(1, -1); }
        }
        map.set(key, part.slice(eq + 1).trim());
      }
      return map;
    }
  }
  return null;
}

function inlineFeaturesHooksDisabled(value) {
  const table = inlineTableValue(value);
  return Boolean(table && table.has("hooks") && tomlBoolean(table.get("hooks")) === false);
}

export function managedHookPolicy({
  requirementsPath = process.env.KRN_REQUIREMENTS_PATH || defaultRequirementsPath(),
} = {}) {
  const stat = fs.lstatSync(requirementsPath, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) return { status: "no_managed_requirements", path: requirementsPath };
  let document;
  try {
    document = parseDocument(fs.readFileSync(requirementsPath, "utf8"));
  } catch (error) {
    return { status: "requirements_unreadable", path: requirementsPath, detail: error.message };
  }
  const ARRAY_TABLE = "\u0000array";
  let table = null;
  try {
    for (let index = 0; index < document.lines.length; index += 1) {
      // Lines inside a multi-line string or an array body are values, not keys.
      if (document.insideMultiline?.[index] || document.insideArray?.[index]) continue;
      const content = document.lines[index].content;
      const header = splitHeader(content);
      if (header) {
        if (header.validTail) {
          table = header.array ? ARRAY_TABLE : (parseDottedHeaderKey(header.inner)?.join(".") ?? ARRAY_TABLE);
        }
        continue;
      }
      const assignment = parseAssignment(content);
      if (assignment) {
        const segments = parseDottedHeaderKey(assignment.prefix.replace(/\s*=\s*$/, "").trim()) ?? [assignment.key];
        const enabled = tomlBoolean(assignment.value);
        if (table === null && segments.length === 1 && segments[0] === "allow_managed_hooks_only" && enabled === true) {
          return {
            status: "hook_inert_by_managed_policy",
            path: requirementsPath,
            detail: "top-level allow_managed_hooks_only = true",
          };
        }
        const featuresDisabled = table === "features" && segments.length === 1 && segments[0] === "hooks" && enabled === false;
        const dottedDisabled = table === null && segments.length === 2 && segments[0] === "features" && segments[1] === "hooks" && enabled === false;
        const inlineDisabled = table === null && segments.length === 1 && segments[0] === "features" && inlineFeaturesHooksDisabled(assignment.value);
        if (featuresDisabled || dottedDisabled || inlineDisabled) {
          return {
            status: "hook_inert_features_disabled",
            path: requirementsPath,
            detail: "[features] hooks = false",
          };
        }
      }
    }
  } catch (error) {
    return { status: "requirements_unreadable", path: requirementsPath, detail: error.message };
  }
  return { status: "hooks_active", path: requirementsPath };
}

export function inspectInstall({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), requirementsPath } = {}) {
  const releaseRoot = path.join(canonicalPath(codexHome), "krn");
  const current = path.join(releaseRoot, "current");
  const override = path.join(path.dirname(releaseRoot), "AGENTS.override.md");
  const overridePresent = Boolean(fs.lstatSync(override, { throwIfNoEntry: false }));
  const currentTarget = resolvedLink(current);
  const manifest = releaseManifest(releaseRoot, currentTarget) ?? (() => {
    if (!fs.existsSync(OWN_MANIFEST)) return null;
    try { return readJson(OWN_MANIFEST); } catch { return null; }
  })();
  const legacyHooks = legacyHookTargets(path.dirname(releaseRoot), manifest);
  const base = {
    releaseRoot,
    current,
    legacyHooks,
    hookPolicy: managedHookPolicy({ requirementsPath }),
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
  const plan = { releaseRoot, current, manifest, source: "", allowLegacySource: true, release: currentTarget };
  const targets = managedTargets(plan).map((item) => itemStatus(plan, item));
  for (const orphan of orphanManagedLinks(plan)) targets.push({ target: orphan, status: "orphaned_link" });
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

export function pruneReleases({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), keep = 3 } = {}) {
  const releaseRoot = path.join(canonicalPath(codexHome), "krn");
  const releasesDir = path.join(releaseRoot, "releases");
  if (!fs.existsSync(releasesDir)) return { removed: [], kept: [] };
  const currentTarget = resolvedLink(path.join(releaseRoot, "current"));
  const candidates = fs.readdirSync(releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(releasesDir, entry.name), mtime: fs.statSync(path.join(releasesDir, entry.name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime);
  const referenced = new Set();
  const linkRoots = [
    process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills"),
    process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin"),
    path.join(codexHome, "hooks"),
  ];
  const noteLink = (target) => {
    const resolved = resolvedLink(target) ?? resolvedPath(target);
    if (resolved) referenced.add(resolved);
  };
  for (const root of linkRoots) {
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) for (const entry of fs.readdirSync(root)) noteLink(path.join(root, entry));
    else noteLink(root);
  }
  for (const file of ["AGENTS.md", "hooks.json"]) noteLink(path.join(codexHome, file));
  const keepNames = new Set(candidates.slice(0, Math.max(keep, 1)).map((entry) => entry.name));
  if (currentTarget) keepNames.add(path.basename(currentTarget));
  const removed = [];
  for (const candidate of candidates) {
    if (keepNames.has(candidate.name)) continue;
    if ([...referenced].some((resolved) => isInside(candidate.path, resolved))) {
      keepNames.add(candidate.name);
      continue;
    }
    fs.rmSync(candidate.path, { recursive: true, force: true });
    removed.push(candidate.name);
  }
  return { removed, kept: [...keepNames].sort() };
}
