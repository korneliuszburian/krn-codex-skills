import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { digestTree, inspectInstall, verifyRelease } from "../../scripts/lib/install/install-inspect.mjs";
import { applyInstall, createInstallPlan } from "../../scripts/lib/install/install-release.mjs";

// The opinion's smallest check, reproduced end to end: a writer rewrites a
// payload file, recomputes the metadata digest, and rewrites the release-local
// ledger copy so the release agrees with itself. Only the ledger as committed
// in the source checkout can decide the release.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(sourceRoot, "scripts", "krn-codex.mjs");
const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const writeLedger = (root, digests) => {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "release-digests.json"),
    `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`,
  );
};

const cleanSource = (base) => {
  const copy = join(base, "source");
  mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  execFileSync("git", ["-C", copy, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", copy, ...identity, "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(copy);
};

const withBase = (body) => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-anchor-")));
  const previous = {};
  for (const key of ["KRN_SKILLS_DEST", "KRN_BIN_DEST", "KRN_OPENCODE_DEST"]) {
    previous[key] = process.env[key];
    process.env[key] = join(base, key.toLowerCase());
  }
  try {
    body(base);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

const installedRelease = (base) => {
  const home = join(base, "codex");
  const source = cleanSource(base);
  const plan = createInstallPlan({ source, cwd: source, codexHome: home });
  applyInstall(plan);
  // The day-one install recorded an override and a release-local ledger; drop
  // the ledger so only a committed anchor can attest to the release.
  fs.rmSync(join(plan.release, "config", "release-digests.json"), { force: true });
  return { home, source, plan, digest: digestTree(plan.release).digest };
};

const commitLedger = (source, digests) => {
  writeLedger(source, digests);
  git(source, [...identity, "add", "config/release-digests.json"]);
  git(source, [...identity, "commit", "-q", "-m", "seal"]);
};

const tamper = (release) => {
  fs.appendFileSync(join(release, "scripts", "krn.mjs"), "\n");
  const metadataFile = join(release, ".krn-release.json");
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  metadata.digest = digestTree(release).digest;
  fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  writeLedger(release, { [metadata.commit]: metadata.digest });
};

test("the default check anchors on the committed ledger and rejects a self-consistent rewrite", () => {
  withBase((base) => {
    const { home, source, plan, digest } = installedRelease(base);
    commitLedger(source, { [plan.commit]: digest });

    const sealed = inspectInstall({ codexHome: home, source });
    assert.equal(sealed.filesystem.status, "filesystem_installed");
    assert.equal(sealed.anchor, "committed");
    assert.equal(sealed.seal, "sealed");

    tamper(plan.release);
    // The release-local copy agrees with the rewritten bytes ...
    assert.doesNotThrow(() => verifyRelease(plan.release, plan.commit));
    // ... but the committed anchor still fails the release.
    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "digest_unsealed");
    assert.equal(report.filesystem.rule, "digest-unsealed");
    assert.equal(report.anchor, "committed");
  });
});

test("bytes matched under an unrelated ledger key are reported as sealed_by_value", () => {
  withBase((base) => {
    const { home, source, digest } = installedRelease(base);
    commitLedger(source, { "another-commit": digest });
    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "filesystem_installed");
    assert.equal(report.anchor, "committed");
    assert.equal(report.seal, "sealed_by_value");
  });
});

test("install check reads the committed anchor from the working checkout", () => {
  withBase((base) => {
    const { home, source, plan, digest } = installedRelease(base);
    commitLedger(source, { [plan.commit]: digest });
    const env = { ...process.env, CODEX_HOME: home };
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: source, env });

    const sealed = run("install", "check", "--json");
    assert.equal(sealed.status, 0, sealed.stderr);
    assert.equal(JSON.parse(sealed.stdout).anchor, "committed");

    tamper(plan.release);
    const tampered = run("install", "check", "--json");
    assert.equal(tampered.status, 3, tampered.stderr);
    const report = JSON.parse(tampered.stdout);
    assert.equal(report.filesystem.status, "digest_unsealed");
    assert.equal(report.anchor, "committed");
  });
});
