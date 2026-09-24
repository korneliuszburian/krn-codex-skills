import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The operator flow, not a fixture: the real CLI runs against a temporary
// CODEX_HOME so the release directory, the `current` link, and the committed
// repository ledger are all exercised end to end.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(sourceRoot, "scripts", "krn-codex.mjs");
const { capabilitySkip, hostCapabilities, FLOW_CAPABILITIES } = await import("../../scripts/lib/install/host-capabilities.mjs");

const git = (repo, args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const cleanSource = (base) => {
  const copy = path.join(base, "source");
  mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  // This fixture models a day-one repository even after the source is sealed.
  fs.writeFileSync(
    path.join(copy, "config", "release-digests.json"),
    `${JSON.stringify({ schema_version: 1, digests: {} }, null, 2)}\n`,
  );
  execFileSync("git", ["-C", copy, "init", "-q"]);
  const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];
  execFileSync("git", ["-C", copy, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", copy, ...identity, "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(copy);
};

test("the CLI seals the repository ledger and never gates apply on the linked release", { skip: capabilitySkip(hostCapabilities(), FLOW_CAPABILITIES.seal) }, () => {
  const committedLedger = JSON.parse(fs.readFileSync(path.join(sourceRoot, "config", "release-digests.json"), "utf8"));
  assert.equal(committedLedger.schema_version, 1);
  for (const [commit, digest] of Object.entries(committedLedger.digests)) {
    assert.match(commit, /^[0-9a-f]{40}$/);
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
  const base = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), "krn-seal-flow-")));
  const source = cleanSource(base);
  const home = path.join(base, "codex");
  mkdirSync(home, { recursive: true });
  const previous = {};
  for (const key of ["KRN_SKILLS_DEST", "KRN_BIN_DEST", "KRN_OPENCODE_DEST"]) {
    previous[key] = process.env[key];
    process.env[key] = path.join(base, key.toLowerCase());
  }
  const env = { ...process.env, CODEX_HOME: home };
  const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, cwd: source });
  try {
    const ledgerFile = path.join(source, "config", "release-digests.json");
    const readLedger = () => JSON.parse(fs.readFileSync(ledgerFile, "utf8")).digests;
    const commitA = git(source, ["rev-parse", "HEAD"]);
    assert.deepEqual(readLedger(), {});

    // Day one: there is no linked release to upgrade, so the install is allowed
    // and the override is recorded on the release.
    const first = run("install", "apply", "--source", source, "--yes", "--json");
    assert.equal(first.status, 0, first.stderr);
    const release = JSON.parse(first.stdout).release;
    assert.equal(JSON.parse(first.stdout).commit, commitA);
    assert.equal(JSON.parse(first.stdout).allowUnsealed, true);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(release, ".krn-release.json"), "utf8")).override?.rule,
      "allow-unsealed",
    );
    assert.deepEqual(readLedger(), {}, "apply must not write the repository ledger");

    // An unsealed target commit may not replace a linked release.
    const refused = run("install", "apply", "--source", source, "--yes", "--json");
    assert.notEqual(refused.status, 0, "an unsealed target commit must be refused");
    assert.match(refused.stderr, /unsealed target commit/);

    // The named override installs it and records the override.
    const allowed = run("install", "apply", "--source", source, "--yes", "--allow-unsealed", "--json");
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(JSON.parse(allowed.stdout).allowUnsealed, true, allowed.stdout);

    // Drop the release-local ledger so the seal below cannot pass by writing it.
    fs.rmSync(path.join(release, "config", "release-digests.json"), { force: true });
    const sealed = run("install", "seal", "--root", source, "--source", source, "--json");
    assert.equal(sealed.status, 0, sealed.stderr);
    const sealReport = JSON.parse(sealed.stdout);
    assert.equal(readLedger()[commitA], sealReport.digest);
    assert.equal(
      fs.existsSync(path.join(release, "config", "release-digests.json")),
      false,
      "seal must write the repository ledger, not the release directory",
    );

    const unsealedReport = run("install", "check", "--json");
    assert.equal(unsealedReport.status, 3, unsealedReport.stderr);
    assert.equal(JSON.parse(unsealedReport.stdout).filesystem.status, "digest_unsealed");

    // Commit the sealed ledger, advance the tree, and seal the new commit.
    git(source, ["add", "config/release-digests.json"]);
    git(source, [...identity, "commit", "-q", "-m", "seal"]);
    fs.appendFileSync(path.join(source, "scripts", "krn-codex.mjs"), "\n");
    git(source, [...identity, "commit", "-q", "-am", "advance"]);
    const sealedCommit = git(source, ["rev-parse", "HEAD"]);
    const sealedNext = run("install", "seal", "--root", source, "--source", source, "--json");
    assert.equal(sealedNext.status, 0, sealedNext.stderr);
    git(source, ["add", "config/release-digests.json"]);
    git(source, [...identity, "commit", "-q", "-m", "seal next"]);
    const appliedCommit = git(source, ["rev-parse", "HEAD"]);
    assert.notEqual(appliedCommit, sealedCommit, "the sealing commit carries the ledger forward");
    assert.equal(readLedger()[sealedCommit], JSON.parse(sealedNext.stdout).digest);
    assert.equal(Object.keys(readLedger()).length, 2, "sealing preserves the prior ledger entry");
    assert.equal(readLedger()[commitA], JSON.parse(sealed.stdout).digest, "a later seal keeps the earlier entry byte-exact");
    assert.equal(readLedger()[appliedCommit], undefined);

    // The target's bytes are sealed even though the linked release is not, so
    // apply installs it rather than refusing on the current release.
    const upgraded = run("install", "apply", "--source", source, "--yes", "--json");
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.equal(JSON.parse(upgraded.stdout).commit, appliedCommit);
    const upgradedReport = run("install", "check", "--json");
    assert.equal(upgradedReport.status, 0, upgradedReport.stderr);
    assert.equal(JSON.parse(upgradedReport.stdout).filesystem.status, "filesystem_installed");
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
