import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gitText as git } from "../support/git-cli.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { isInside } from "../support/path-rules.mjs";
import { readJson } from "../support/read-json.mjs";
import { removeTree } from "../support/remove-tree.mjs";
import { parseAssignment, parseDocument, parseDottedHeaderKey, parseTomlString, splitHeader } from "../catalog/catalog-toml.mjs";

const { SOURCE: EXIT_SOURCE, CORRUPT: EXIT_CORRUPT } = EXIT_CODES;

const OWN_MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "skills", "manifest.json");

// The committed digest ledger is the separate trust anchor for a release: it
// records the subject digest for a commit outside the released bytes, so
// rewriting a tree and its metadata together still fails verification. It is
// excluded from the tree digest because sealing appends to a release copy.
export const RELEASE_DIGESTS_RELATIVE = "config/release-digests.json";

export function canonicalPath(candidate) {
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

export function digestTree(root) {
  const hash = crypto.createHash("sha256");
  const entries = [];
  function visit(relative = "") {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(relative, entry.name);
      if (next === ".krn-release.json" || next === RELEASE_DIGESTS_RELATIVE) continue;
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

export function releaseDigests(release) {
  const file = path.join(release, RELEASE_DIGESTS_RELATIVE);
  if (!fs.existsSync(file)) return {};
  let document;
  try {
    document = readJson(file);
  } catch {
    fail(`release digest ledger is unreadable: ${file}`, EXIT_CORRUPT);
  }
  const digests = document?.digests;
  if (digests === undefined || digests === null) return {};
  if (typeof digests !== "object" || Array.isArray(digests)) {
    fail(`release digest ledger is malformed: ${file}`, EXIT_CORRUPT);
  }
  return digests;
}

// The anchor is the ledger as committed, not the working copy: `install seal`
// writes the ledger before it is committed, and a release that only the
// working tree seals is not yet anchored. Falls back to the release-local copy
// when the checkout carries no committed seal.
function committedReleaseDigests(root) {
  const location = `HEAD:${RELEASE_DIGESTS_RELATIVE}`;
  const text = git(root, ["show", location]);
  if (text === "") return null;
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    fail(`committed release digest ledger is unreadable: ${location}`, EXIT_CORRUPT);
  }
  const digests = document?.digests;
  if (digests === undefined || digests === null) return null;
  if (typeof digests !== "object" || Array.isArray(digests)) {
    fail(`committed release digest ledger is malformed: ${location}`, EXIT_CORRUPT);
  }
  return digests;
}

function anchoredLedger(source) {
  if (!source) return null;
  const root = git(source, ["rev-parse", "--show-toplevel"]);
  if (!root) return null;
  const digests = committedReleaseDigests(fs.realpathSync(root));
  // An empty ledger seals nothing; the in-release copy stays the only anchor
  // for a day-one install that was allowed through the explicit override.
  if (!digests || Object.keys(digests).length === 0) return null;
  return digests;
}

function unsealed(message) {
  const error = new Error(message);
  error.exitCode = EXIT_CORRUPT;
  error.rule = "digest-unsealed";
  throw error;
}

export function verifyRelease(release, commit, { requireSealed = true, ledger, anchor } = {}) {
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
  const usedAnchor = anchor ?? (ledger === undefined ? "release" : "committed");
  if (!requireSealed) return { ...metadata, anchor: usedAnchor };
  const entries = ledger ?? releaseDigests(release);
  const sealed = entries[commit];
  if (typeof sealed === "string") {
    if (sealed !== actual) {
      unsealed(`digest-unsealed: release ${commit} tree digest does not match the digest ledger`);
    }
    return { ...metadata, anchor: usedAnchor, seal: "sealed" };
  }
  // The committed ledger changes the commit that carries it, so the sealing
  // commit is never the one it names; the same bytes recorded under any name
  // are sealed, but that indirection is reported as such rather than as a
  // first-class seal.
  if (Object.values(entries).includes(actual)) return { ...metadata, anchor: usedAnchor, seal: "sealed_by_value" };
  unsealed(`digest-unsealed: release ${commit} has no digest entry in ${RELEASE_DIGESTS_RELATIVE}`);
}

export function managedTargets(plan) {
  if (!plan.manifest) return [];
  const skillDest = process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills");
  const binDest = process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin");
  const codexHome = path.dirname(plan.releaseRoot);
  const targets = [];
  const add = (label, root, name, relative) => {
    const normalizedRoot = path.resolve(root);
    const target = path.join(normalizedRoot, name);
    if (path.dirname(target) !== normalizedRoot || name === "." || name === "..") fail(`unsafe managed destination: ${name}`, EXIT_SOURCE);
    targets.push({ label, target, relative });
  };
  for (const skill of Array.isArray(plan.manifest?.skills) ? plan.manifest.skills : []) {
    add(`skill__${skill.name}`, skillDest, skill.name, skill.path);
  }
  for (const bin of Array.isArray(plan.manifest?.bins) ? plan.manifest.bins : []) {
    add(`bin__${bin.name}`, binDest, bin.name, bin.path);
  }
  targets.push({ label: "global__AGENTS.md", target: path.join(codexHome, "AGENTS.md"), relative: plan.manifest.global_agents });
  targets.push({ label: "global__hooks.json", target: path.join(codexHome, "hooks.json"), relative: plan.manifest.global_hooks });
  for (const hook of Array.isArray(plan.manifest.global_hook_files) ? plan.manifest.global_hook_files : []) {
    add(`hook__${hook.name}`, path.join(codexHome, "hooks"), hook.name, hook.path);
  }
  if (plan.manifest.opencode_agents) {
    const opencodeConfig = process.env.KRN_OPENCODE_DEST || path.join(os.homedir(), ".config", "opencode");
    add("opencode__AGENTS.md", opencodeConfig, "AGENTS.md", plan.manifest.opencode_agents);
    for (const plugin of Array.isArray(plan.manifest.opencode_plugins) ? plan.manifest.opencode_plugins : []) {
      add(`opencode_plugin__${plugin.name}`, path.join(opencodeConfig, "plugins"), plugin.name, plugin.path);
    }
  }
  return targets;
}

export function legacyHookTargets(codexHome, manifest) {
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

export function resolvedLink(target) {
  if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) return null;
  return resolvedPath(target);
}

function resolvedPath(target) {
  try { return fs.realpathSync(target); } catch { return null; }
}

export function stableTarget(plan, item) {
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
      : plan.allowLegacySource === true && (
        fs.existsSync(path.join(sourceRoot, "scripts", "krn.mjs"))
        || fs.existsSync(path.join(sourceRoot, "scripts", "krn-codex.mjs"))
      ))
  ) {
    return "legacy_source";
  }
  return "foreign";
}

function linkResolvesInto(target, root) {
  let textual;
  try { textual = fs.readlinkSync(target); } catch { return false; }
  const absolute = path.isAbsolute(textual) ? textual : path.resolve(path.dirname(target), textual);
  return isInside(root, absolute);
}

export function orphanManagedLinks(plan) {
  const opencodeDest = process.env.KRN_OPENCODE_DEST || path.join(os.homedir(), ".config", "opencode");
  const roots = [
    process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills"),
    process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin"),
    path.join(path.dirname(plan.releaseRoot), "hooks"),
    opencodeDest,
    path.join(opencodeDest, "plugins"),
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
  if (!stat) return { status: "no_managed_requirements", path: requirementsPath };
  if (!stat.isFile()) return { status: "requirements_unreadable", path: requirementsPath, detail: "requirements path is not a regular file" };
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

export function inspectInstall({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), requirementsPath, source = process.cwd() } = {}) {
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
  const ledger = anchoredLedger(source);
  const base = {
    releaseRoot,
    current,
    legacyHooks,
    anchor: ledger ? "committed" : "release",
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
  try {
    metadata = verifyRelease(
      currentTarget,
      path.basename(currentTarget),
      ledger ? { ledger, anchor: "committed" } : {},
    );
  } catch (error) {
    const status = error.rule === "digest-unsealed" ? "digest_unsealed" : "broken_link";
    return { ...base, filesystem: { status, detail: error.message, ...(error.rule ? { rule: error.rule } : {}) }, targets: [] };
  }
  if (!manifest) return { ...base, filesystem: { status: "broken_link", detail: "release manifest is missing or unreadable" }, targets: [] };
  const plan = { releaseRoot, current, manifest, source: "", allowLegacySource: true, release: currentTarget };
  const targets = managedTargets(plan).map((item) => itemStatus(plan, item));
  for (const orphan of orphanManagedLinks(plan)) targets.push({ target: orphan, status: "orphaned_link" });
  const bad = targets.find((item) => item.status !== "filesystem_installed");
  return {
    ...base,
    commit: metadata.commit,
    seal: metadata.seal,
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
  const releasesStat = fs.lstatSync(releasesDir, { throwIfNoEntry: false });
  const resolvedReleases = releasesStat ? fs.realpathSync(releasesDir) : null;
  if (
    !releasesStat ||
    !releasesStat.isDirectory() ||
    releasesStat.isSymbolicLink() ||
    resolvedReleases !== releasesDir ||
    !isInside(releaseRoot, resolvedReleases)
  ) {
    return { removed: [], kept: [], refused: "releases-root-unresolvable" };
  }
  const currentTarget = resolvedLink(path.join(releaseRoot, "current"));
  const candidates = fs.readdirSync(releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(releasesDir, entry.name), mtime: fs.statSync(path.join(releasesDir, entry.name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime);
  const referenced = new Set();
  const opencodeDest = process.env.KRN_OPENCODE_DEST || path.join(os.homedir(), ".config", "opencode");
  const linkRoots = [
    process.env.KRN_SKILLS_DEST || path.join(os.homedir(), ".agents", "skills"),
    process.env.KRN_BIN_DEST || path.join(os.homedir(), ".local", "bin"),
    path.join(codexHome, "hooks"),
    opencodeDest,
    path.join(opencodeDest, "plugins"),
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
    removeTree(candidate.path);
    removed.push(candidate.name);
  }
  return { removed, kept: [...keepNames].sort() };
}
