import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gitText as git, gitTopLevel, runGitRaw } from "../kernel/git.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { isInside, posixRelative } from "../support/path-rules.mjs";
import { readJson } from "../kernel/json.mjs";
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

const DIGEST_ROOT = path.parse(process.cwd()).root;

// A digest key is a tree-relative path in its single canonical spelling: POSIX
// separators, whatever path module produced it. `path.win32` folds a key made
// on Windows, and `posixRelative`, the project's owner of the POSIX spelling,
// rewrites it under a host-independent root so comparison and hashing never
// depend on the current working directory.
export function digestKey(value) {
  const suffix = path.win32.normalize(String(value)).replaceAll("\\", "/").replace(/^\/+/, "");
  return posixRelative(DIGEST_ROOT, path.join(DIGEST_ROOT, suffix));
}

export function digestTree(root) {
  const hash = crypto.createHash("sha256");
  const entries = [];
  function visit(relative = "") {
    const absolute = path.join(root, relative);
    const dirents = fs.readdirSync(absolute, { withFileTypes: true })
      .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const entry of dirents) {
      const next = digestKey(path.join(relative, entry.name));
      if (next === ".krn-release.json" || next === RELEASE_DIGESTS_RELATIVE) continue;
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile()) entries.push(next);
      else fail(`release contains unsupported filesystem entry: ${next}`, EXIT_CORRUPT);
    }
  }
  visit();
  for (const relative of entries) {
    // Content-only hashing: the extractor's umask must not move the trust
    // anchor, so the executable bit is deliberately not part of the digest.
    hash.update(`${relative}\0`);
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: entries };
}

// The pre-sh-56 digest spelling is retained so a release sealed before the
// algorithm change is a named upgrade state, never a false corruption verdict.
// It differs in key spelling (path.join), sibling order (localeCompare), and
// the executable bit; a release whose bytes match this digest is `superseded`.
export function legacyDigestTree(root) {
  const hash = crypto.createHash("sha256");
  const entries = [];
  function visit(relative = "") {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
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

// A failed release is not automatically a broken link: each corruption family
// names itself so a caller can tell a torn ledger from a rewritten tree.
function releaseCorrupt(message) {
  const error = new Error(message);
  error.exitCode = EXIT_CORRUPT;
  error.rule = "release-corrupt";
  throw error;
}

// A release sealed under the earlier digest algorithm is not corrupt: it is a
// superseded release that `install apply` can replace or quarantine.
function releaseSuperseded(message) {
  const error = new Error(message);
  error.exitCode = EXIT_CORRUPT;
  error.rule = "digest-legacy";
  throw error;
}

function releaseMetadata(release) {
  const file = path.join(release, ".krn-release.json");
  if (!fs.existsSync(file)) releaseCorrupt(`existing release lacks metadata: ${release}`);
  try {
    return readJson(file);
  } catch {
    releaseCorrupt(`existing release has invalid metadata: ${release}`);
  }
}

export function releaseDigests(release) {
  const file = path.join(release, RELEASE_DIGESTS_RELATIVE);
  if (!fs.existsSync(file)) return {};
  let document;
  try {
    document = readJson(file);
  } catch {
    failLedger(`release digest ledger is unreadable: ${file}`, "ledger-unreadable");
  }
  const digests = document?.digests;
  if (digests === undefined || digests === null) return {};
  if (typeof digests !== "object" || Array.isArray(digests)) {
    failLedger(`release digest ledger is malformed: ${file}`, "ledger-malformed");
  }
  return digests;
}

// An unsealed override is an install-environment event, not part of the
// released bytes, so its audit record lives beside the release store rather
// than inside a release. That keeps it readable after a release is rebuilt or
// pruned, and lets `install check` name the override instead of calling the
// release a plain install.
const OVERRIDE_RECORDS_RELATIVE = "install-overrides";

export function overrideRecordPath(releaseRoot, commit) {
  if (typeof commit !== "string" || !/^[0-9a-f]{4,64}$/.test(commit)) return null;
  return path.join(releaseRoot, OVERRIDE_RECORDS_RELATIVE, `${commit}.json`);
}

export function readOverrideRecord(releaseRoot, commit) {
  const file = overrideRecordPath(releaseRoot, commit);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const record = readJson(file);
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    return record;
  } catch {
    return null;
  }
}

// The anchor is the ledger as committed, not the working copy: `install seal`
// writes the ledger before it is committed, and a release that only the
// working tree seals is not yet anchored. A committed ledger is authoritative
// even when it is empty, so a release-local-only seal can never launder a
// release once the repository ships a ledger; only a checkout with no committed
// ledger file at all falls back to the release-local copy.
function committedReleaseDigests(root) {
  const location = `HEAD:${RELEASE_DIGESTS_RELATIVE}`;
  const text = git(root, ["show", location]);
  if (text === "") return null;
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    failLedger(`committed release digest ledger is unreadable: ${location}`, "ledger-unreadable");
  }
  const digests = document?.digests;
  if (digests === undefined || digests === null) return null;
  if (typeof digests !== "object" || Array.isArray(digests)) {
    failLedger(`committed release digest ledger is malformed: ${location}`, "ledger-malformed");
  }
  return digests;
}

function anchoredLedger(source) {
  if (!source) return null;
  const root = gitTopLevel(source);
  if (!root) return null;
  const digests = committedReleaseDigests(fs.realpathSync(root));
  // An empty committed ledger is still the anchor: it attests nothing, so the
  // release must fail as unsealed rather than fall back to a release-local copy
  // the release itself can rewrite. `null` stays reserved for a checkout that
  // carries no committed ledger file, where the fallback is the only anchor.
  if (!digests) return null;
  return digests;
}

function failLedger(message, rule) {
  const error = new Error(message);
  error.exitCode = EXIT_CORRUPT;
  error.rule = rule;
  throw error;
}

// Ancestry is provenance, not an integrity claim: it can only ever admit a
// ledger entry as the sealing-commit indirection, never override a digest
// mismatch the caller already rejected.
export function gitAncestor(source, ancestor, descendant) {
  if (!source || !/^[0-9a-f]{4,64}$/.test(ancestor) || !/^[0-9a-f]{4,64}$/.test(descendant)) return false;
  return runGitRaw(source, ["merge-base", "--is-ancestor", ancestor, descendant]).ok;
}

function unsealed(message) {
  failLedger(message, "digest-unsealed");
}

// A ledger or release corruption keeps its own status instead of being
// flattened into `broken_link`, which stays reserved for an unresolvable link.
const RULE_STATUS = Object.freeze({
  "ledger-unreadable": "ledger_unreadable",
  "ledger-malformed": "ledger_malformed",
  "ledger-unattested": "digest_unsealed",
  "release-corrupt": "release_corrupt",
  "digest-legacy": "release_superseded",
});

function failureFilesystem(error) {
  const rule = error?.rule;
  const status = RULE_STATUS[rule] ?? "broken_link";
  return { status, detail: error?.message, ...(rule ? { rule } : {}) };
}

// The release-local ledger is an untrusted copy the release itself can
// rewrite, so it can only be named as a non-attestation, never promoted to an
// anchor.
function releaseLocalAttests(entries, commit, digest, source) {
  const recorded = entries[commit];
  if (typeof recorded === "string" && recorded === digest) return true;
  return Object.entries(entries).some(([key, value]) => {
    if (value !== digest) return false;
    if (key === commit) return true;
    if (!source) return true;
    return gitAncestor(source, key, commit);
  });
}

export function verifyRelease(release, commit, { requireSealed = true, ledger, anchor, source } = {}) {
  const stat = fs.lstatSync(release, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    releaseCorrupt(`existing release is not a regular directory: ${release}`);
  }
  const metadata = releaseMetadata(release);
  if (metadata.schemaVersion !== 1 || metadata.commit !== commit || typeof metadata.digest !== "string") {
    releaseCorrupt(`existing release metadata does not match ${commit}: ${release}`);
  }
  const actual = digestTree(release).digest;
  if (actual !== metadata.digest) {
    // A digest computed under the pre-sh-56 algorithm is a named upgrade, not
    // corruption; a release that matches neither spelling stays corrupt.
    if (legacyDigestTree(release).digest !== metadata.digest) {
      releaseCorrupt(`existing release is corrupt: ${release}`);
    }
    releaseSuperseded(`existing release was sealed under a superseded digest algorithm: ${release}`);
  }
  const usedAnchor = anchor ?? (ledger === undefined ? "release" : "committed");
  if (!requireSealed) return { ...metadata, anchor: usedAnchor };
  // The release-local ledger is validated even when the committed ledger
  // decides, so a torn in-release copy stays a named corruption finding; it is
  // never consulted for the seal itself when a committed anchor is supplied.
  const releaseLocal = releaseDigests(release);
  const entries = ledger ?? releaseLocal;
  const sealed = entries[commit];
  if (typeof sealed === "string") {
    if (sealed !== actual) {
      unsealed(`digest-unsealed: release ${commit} tree digest does not match the digest ledger`);
    }
    return { ...metadata, anchor: usedAnchor, seal: "sealed" };
  }
  // The committed ledger changes the commit that carries it, so the sealing
  // commit is never the one it names. At the mutation boundary the caller
  // supplies `source`, which narrows byte-equality to the sealing-commit
  // indirection: the target's own key, or a key that is an ancestor of the
  // target. Without a source (the release-local fallback doctor reads) a
  // value match stays sealed_by_value, as the LT-66 anchor reports it.
  const sealedByValue = Object.entries(entries).some(([key, value]) => {
    if (value !== actual) return false;
    if (key === commit) return true;
    if (!source) return true;
    return gitAncestor(source, key, commit);
  });
  if (sealedByValue) return { ...metadata, anchor: usedAnchor, seal: "sealed_by_value" };
  // A release that only its own rewriteable copy seals is not attested by the
  // repository: the committed ledger must carry the entry. Name that refusal so
  // an empty or rewritten shipped ledger is never mistaken for a plain miss.
  if (ledger !== undefined && releaseLocalAttests(releaseLocal, commit, actual, source)) {
    failLedger(
      `ledger-unattested: release ${commit} is sealed only by its release-local ${RELEASE_DIGESTS_RELATIVE}`,
      "ledger-unattested",
    );
  }
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
  // Prior-release classification is about the link shape and the release's
  // structural integrity; an unsealed (audited or not) or superseded prior
  // release still classifies, exactly as a sealed one does, so apply can
  // migrate it without a manual filesystem action.
  try { verifyRelease(path.join(releases, segments[0]), segments[0], { requireSealed: false }); return true; } catch (error) { return error?.rule === "digest-legacy"; }
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
  const sourceRoot = gitTopLevel(path.dirname(linked));
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
  let ledger = null;
  let ledgerError = null;
  try {
    ledger = anchoredLedger(source);
  } catch (error) {
    ledgerError = error;
  }
  const overrideAudit = currentTarget ? readOverrideRecord(releaseRoot, path.basename(currentTarget)) : null;
  const base = {
    releaseRoot,
    current,
    legacyHooks,
    anchor: ledger ? "committed" : "release",
    hookPolicy: managedHookPolicy({ requirementsPath }),
    session: { status: "session_loaded_unknown" },
    sessionAfterApply: { status: "stale_session_likely" },
    ...(overrideAudit ? { override: overrideAudit } : {}),
  };
  // A corrupt ledger is a first-class finding, not a reason to throw the whole
  // inspection away.
  if (ledgerError) return { ...base, filesystem: failureFilesystem(ledgerError), targets: [] };
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
  let overrideSeal = false;
  try {
    metadata = verifyRelease(
      currentTarget,
      path.basename(currentTarget),
      ledger ? { ledger, anchor: "committed" } : {},
    );
  } catch (error) {
    if (error.rule !== "digest-unsealed") {
      return { ...base, filesystem: failureFilesystem(error), targets: [] };
    }
    // An intact audit record whose digest still matches the bytes is an
    // explicit override, not corruption. Keep inspecting targets and keep the
    // override visible; a mismatched record is a tampered release and stays a
    // plain unsealed verdict.
    const intact = Boolean(overrideAudit) && overrideAudit.digest === digestTree(currentTarget).digest;
    if (!intact) {
      return { ...base, filesystem: { status: "digest_unsealed", detail: error.message, rule: error.rule }, targets: [] };
    }
    try {
      metadata = verifyRelease(currentTarget, path.basename(currentTarget), { requireSealed: false });
    } catch (integrity) {
      return { ...base, filesystem: failureFilesystem(integrity), targets: [] };
    }
    overrideSeal = true;
  }
  if (!manifest) return { ...base, filesystem: { status: "broken_link", detail: "release manifest is missing or unreadable" }, targets: [] };
  const plan = { releaseRoot, current, manifest, source: "", allowLegacySource: true, release: currentTarget };
  const targets = managedTargets(plan).map((item) => itemStatus(plan, item));
  for (const orphan of orphanManagedLinks(plan)) targets.push({ target: orphan, status: "orphaned_link" });
  const bad = targets.find((item) => item.status !== "filesystem_installed");
  const overrideFilesystem = overrideSeal
    ? {
      status: "digest_unsealed",
      rule: "digest-unsealed",
      override: { actor: overrideAudit.actor, reason: overrideAudit.reason, at: overrideAudit.at },
    }
    : null;
  return {
    ...base,
    commit: metadata.commit,
    seal: overrideSeal ? "override_unsealed" : metadata.seal,
    legacyHooks,
    filesystem: overridePresent
      ? { status: "masked_by_override", detail: override }
      : legacyHooks.length > 0
        ? { status: "legacy_hook_conflict", detail: legacyHooks.join(", ") }
        : bad
          ? { status: bad.status }
          : (overrideFilesystem ?? { status: "filesystem_installed" }),
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
