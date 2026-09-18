import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The mutation boundary, not doctor: `install apply` must verify the committed
// digest ledger before switching `current`. The base hole accepts any ledger
// value equal to the target digest, so a digest recorded under an unrelated
// commit key installs as sealed. This observer drives the real CLI end to end
// inside its own temporary CODEX_HOME and source copy.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(sourceRoot, "scripts", "krn.mjs");
const { hostCapabilities } = await import("../../scripts/lib/install/host-capabilities.mjs");

const skip = hostCapabilities().gitChild ? false : "git is unavailable";
const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const cleanSource = (base) => {
  const copy = path.join(base, "source");
  mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  execFileSync("git", ["-C", copy, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", copy, ...identity, "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(copy);
};

const writeLedger = (root, digests) => {
  mkdirSync(path.join(root, "config"), { recursive: true });
  writeFileSync(
    path.join(root, "config", "release-digests.json"),
    `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`,
  );
};

const commitLedger = (source, digests) => {
  writeLedger(source, digests);
  git(source, [...identity, "add", "config/release-digests.json"]);
  git(source, [...identity, "commit", "-q", "-m", "seal"]);
  return git(source, ["rev-parse", "HEAD"]);
};

const withBase = (body) => {
  const base = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), "krn-digest-seal-")));
  const previous = {};
  for (const key of ["KRN_SKILLS_DEST", "KRN_BIN_DEST", "KRN_OPENCODE_DEST"]) {
    previous[key] = process.env[key];
    process.env[key] = path.join(base, key.toLowerCase());
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

test("apply verifies the committed digest entry before switching current", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = path.join(base, "codex");
    mkdirSync(home, { recursive: true });
    const env = { ...process.env, CODEX_HOME: home };
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, cwd: source });
    const readLedger = () => JSON.parse(fs.readFileSync(path.join(source, "config", "release-digests.json"), "utf8")).digests;
    const currentPath = path.join(home, "krn", "current");
    const currentTarget = () => {
      const stat = fs.lstatSync(currentPath, { throwIfNoEntry: false });
      return stat?.isSymbolicLink() ? fs.realpathSync(currentPath) : null;
    };
    const overrideFile = (commit) => path.join(home, "krn", "install-overrides", `${commit}.json`);

    // Day one has no linked release: the implicit override installs the first
    // release and gives the later upgrades a current binding to protect.
    const dayOne = run("install", "apply", "--source", source, "--yes", "--json");
    assert.equal(dayOne.status, 0, dayOne.stderr);
    const dayOneCommit = JSON.parse(dayOne.stdout).commit;
    const dayOneRelease = fs.realpathSync(JSON.parse(dayOne.stdout).release);
    assert.equal(currentTarget(), dayOneRelease, "day one links the first release");

    // Advance and record the new target's exact bytes under an unrelated key:
    // the base hole installs this as sealed, the fixed apply must refuse.
    fs.appendFileSync(path.join(source, "scripts", "krn.mjs"), "\n");
    git(source, [...identity, "commit", "-q", "-am", "advance"]);
    const target = git(source, ["rev-parse", "HEAD"]);
    const targetSeal = run("install", "seal", "--root", source, "--source", source, "--json");
    assert.equal(targetSeal.status, 0, targetSeal.stderr);
    const targetDigest = JSON.parse(targetSeal.stdout).digest;
    const unrelatedKey = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    assert.notEqual(unrelatedKey, target);
    const head = commitLedger(source, { [unrelatedKey]: targetDigest });
    assert.deepEqual(readLedger(), { [unrelatedKey]: targetDigest }, "the digest lives under an unrelated key");
    assert.equal(readLedger()[head], undefined);
    assert.notEqual(head, dayOneCommit);

    const refused = run("install", "apply", "--source", source, "--yes", "--json");
    assert.notEqual(refused.status, 0, "apply must refuse a digest recorded under an unrelated key");
    assert.match(refused.stderr, /unsealed/);
    assert.equal(currentTarget(), dayOneRelease, "a refused apply must not switch current");

    // The named override applies and records the override in the audit line.
    const allowed = run("install", "apply", "--source", source, "--yes", "--allow-unsealed", "--json");
    assert.equal(allowed.status, 0, allowed.stderr);
    const applied = JSON.parse(allowed.stdout);
    assert.equal(applied.allowUnsealed, true, allowed.stdout);
    assert.ok(fs.existsSync(overrideFile(head)), `the override must be recorded at ${overrideFile(head)}`);
    const override = JSON.parse(fs.readFileSync(overrideFile(head), "utf8"));
    assert.equal(override.rule, "allow-unsealed");
    assert.equal(override.commit, head);
    assert.equal(override.digest, targetDigest);
    assert.equal(currentTarget(), fs.realpathSync(applied.release), "the override installs the release");

    // Advance again: the previous target is now an ancestor, so the
    // byte-equality entry under its key is the documented sealing-commit
    // indirection and installs without any override.
    fs.appendFileSync(path.join(source, "scripts", "krn.mjs"), "\n");
    git(source, [...identity, "commit", "-q", "-am", "advance again"]);
    const ancestorKey = git(source, ["rev-parse", "HEAD"]);
    const ancestorSeal = run("install", "seal", "--root", source, "--source", source, "--json");
    assert.equal(ancestorSeal.status, 0, ancestorSeal.stderr);
    const ancestorDigest = JSON.parse(ancestorSeal.stdout).digest;
    const ancestorHead = commitLedger(source, { [ancestorKey]: ancestorDigest });
    assert.notEqual(ancestorHead, ancestorKey, "the sealing commit is a child of the commit it names");
    assert.notEqual(ancestorKey, target);

    const ancestorInstall = run("install", "apply", "--source", source, "--yes", "--json");
    assert.equal(ancestorInstall.status, 0, ancestorInstall.stderr);
    const ancestorApplied = JSON.parse(ancestorInstall.stdout);
    assert.equal(ancestorApplied.allowUnsealed, false, "an ancestor-named entry records no override");
    assert.equal(currentTarget(), fs.realpathSync(ancestorApplied.release));
    assert.equal(
      fs.existsSync(overrideFile(ancestorHead)),
      false,
      "an ancestor-named entry must not record an override",
    );
  });
});
