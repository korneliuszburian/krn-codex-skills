import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sha256Hex } from "../kernel/digest.mjs";
import { removeTree } from "../support/remove-tree.mjs";

const SOURCE_REPOSITORY = "https://github.com/rekurencja/boilerplate-rekurencja";
const SKILL_PATH = path.join("skills", "frontend", "frontend-library");
const MANIFEST_NAME = "library-manifest.json";

function walkFiles(root, current = root) {
  if (!fs.existsSync(current)) return [];
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) throw new Error(`frontend library contains a non-file entry: ${absolute}`);
    return [path.relative(root, absolute).split(path.sep).join("/")];
  }).sort();
}

function safeRelative(value) {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== ".." && !normalized.startsWith("../") && !value.includes("\\");
}

function manifestDigest(files) {
  return sha256Hex(`${JSON.stringify(files)}\n`);
}

function readManifest(file) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`invalid frontend library manifest: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1) throw new Error(`unsupported frontend library schema: ${manifest.schemaVersion}`);
  if (manifest.source?.repository !== SOURCE_REPOSITORY || !/^[0-9a-f]{40}$/.test(manifest.source?.commit ?? "")) {
    throw new Error("frontend library manifest has no admitted source identity");
  }
  if (!manifest.upstream?.repository || !manifest.upstream?.pullRequest) {
    throw new Error("frontend library manifest has no upstream provenance");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("frontend library manifest has no path set");
  if (manifest.bundleDigest !== manifestDigest(manifest.files)) throw new Error("frontend library manifest digest mismatch");
  const paths = new Set();
  for (const file of manifest.files) {
    if (!safeRelative(file.path) || !["css/", "design-tokens/"].some((prefix) => file.path.startsWith(prefix))) {
      throw new Error(`frontend library manifest has unsafe or undeclared path: ${file.path}`);
    }
    if (paths.has(file.path)) throw new Error(`frontend library manifest repeats path: ${file.path}`);
    if (file.classification !== "core" || !/^[0-9a-f]{64}$/.test(file.sha256 ?? "") || !Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new Error(`frontend library manifest has invalid file identity: ${file.path}`);
    }
    paths.add(file.path);
  }
  return manifest;
}

function verifyFiles({ directory, manifest, bundle = false }) {
  const prefix = bundle ? "files" : "";
  const declared = manifest.files.map((file) => file.path).sort();
  const actualRoot = path.join(directory, prefix);
  const actual = walkFiles(actualRoot);
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    const undeclared = actual.find((entry) => !declared.includes(entry));
    const missing = declared.find((entry) => !actual.includes(entry));
    throw new Error(undeclared
      ? `frontend library has undeclared file: ${undeclared}`
      : `frontend library is missing file: ${missing}`);
  }
  for (const file of manifest.files) {
    const contents = fs.readFileSync(path.join(actualRoot, file.path));
    if (contents.byteLength !== file.bytes || sha256Hex(contents) !== file.sha256) {
      throw new Error(`frontend library digest mismatch for ${file.path}`);
    }
  }
}

function verifyBundle(bundle) {
  const manifest = readManifest(path.join(bundle, "manifest.json"));
  const topLevel = walkFiles(bundle);
  const expected = ["manifest.json", ...manifest.files.map((file) => `files/${file.path}`)].sort();
  if (JSON.stringify(topLevel) !== JSON.stringify(expected)) {
    const undeclared = topLevel.find((entry) => !expected.includes(entry));
    const missing = expected.find((entry) => !topLevel.includes(entry));
    throw new Error(undeclared ? `frontend bundle has undeclared file: ${undeclared}` : `frontend bundle is missing file: ${missing}`);
  }
  verifyFiles({ directory: bundle, manifest, bundle: true });
  return manifest;
}

export function checkFrontendLibrary({ root }) {
  const skill = path.join(path.resolve(root), SKILL_PATH);
  const manifest = readManifest(path.join(skill, MANIFEST_NAME));
  verifyFiles({ directory: path.join(skill, "library"), manifest });
  return { bundleDigest: manifest.bundleDigest, source: manifest.source, files: manifest.files.length };
}

export function importFrontendLibrary({ root, bundle, copyTree = fs.cpSync }) {
  const resolvedRoot = path.resolve(root);
  const resolvedBundle = path.resolve(bundle);
  const manifest = verifyBundle(resolvedBundle);
  const skill = path.join(resolvedRoot, SKILL_PATH);
  if (!fs.statSync(skill, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`frontend-library skill is missing: ${skill}`);

  const staging = fs.mkdtempSync(path.join(skill, ".library-stage-"));
  const stagedLibrary = path.join(staging, "library");
  const library = path.join(skill, "library");
  const backup = path.join(staging, "previous-library");
  const manifestFile = path.join(skill, MANIFEST_NAME);
  const previousManifest = fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile) : null;
  let backupCreated = false;
  let replacementInstalled = false;
  try {
    copyTree(path.join(resolvedBundle, "files"), stagedLibrary, { recursive: true, errorOnExist: true });
    verifyFiles({ directory: stagedLibrary, manifest });
    if (fs.existsSync(library)) {
      fs.renameSync(library, backup);
      backupCreated = true;
    }
    fs.renameSync(stagedLibrary, library);
    replacementInstalled = true;
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    checkFrontendLibrary({ root: resolvedRoot });
    removeTree(backup);
    return { bundleDigest: manifest.bundleDigest, source: manifest.source, files: manifest.files.length };
  } catch (error) {
    if (backupCreated) {
      if (replacementInstalled && fs.existsSync(library)) removeTree(library);
      try {
        fs.renameSync(backup, library);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `frontend library restore failed; previous library retained at ${backup}`);
      }
    } else if (replacementInstalled && fs.existsSync(library)) {
      removeTree(library);
    }
    if (replacementInstalled) {
      if (previousManifest === null) fs.rmSync(manifestFile, { force: true });
      else fs.writeFileSync(manifestFile, previousManifest);
    }
    throw error;
  } finally {
    if (!fs.existsSync(backup)) removeTree(staging);
  }
}
