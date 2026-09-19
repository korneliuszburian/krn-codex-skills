import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { digestTree, inspectInstall } from "../../scripts/lib/install/install-inspect.mjs";
import { applyInstall, createInstallPlan } from "../../scripts/lib/install/install-release.mjs";
import { hostCapabilities } from "../../scripts/lib/install/host-capabilities.mjs";

// The committed ledger is the only trust anchor: `config/release-digests.json`
// ships empty, and `digestTree` excludes the ledger and metadata by design, so
// a release that rewrites its bytes, its metadata, and its own ledger copy
// would otherwise agree with itself. These cases pin the falsifiable minimum:
// verification requires a committed entry for the exact release commit, and a
// release-local-only seal is a named refusal rather than an install.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const skip = hostCapabilities().gitChild ? false : "git is unavailable";
const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

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
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-attestation-")));
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

const writeLedger = (root, digests) => {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "release-digests.json"),
    `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`,
  );
};

const commitLedger = (source, digests) => {
  writeLedger(source, digests);
  git(source, [...identity, "add", "config/release-digests.json"]);
  git(source, [...identity, "commit", "-q", "-m", "seal"]);
};

const installedRelease = (base) => {
  const home = join(base, "codex");
  const source = cleanSource(base);
  const plan = createInstallPlan({ source, cwd: source, codexHome: home });
  applyInstall(plan);
  return { home, source, plan, digest: digestTree(plan.release).digest };
};

test("an installed release sealed only by its release-local ledger is refused as unattested", { skip }, () => {
  withBase((base) => {
    const { home, source, plan, digest } = installedRelease(base);
    // The repository ships an empty ledger, so the only seal present is the
    // release's own rewriteable copy.
    const shipped = JSON.parse(fs.readFileSync(join(source, "config", "release-digests.json"), "utf8"));
    assert.deepEqual(shipped.digests, {}, "the shipped ledger carries no entry");
    writeLedger(plan.release, { [plan.commit]: digest });

    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "digest_unsealed", JSON.stringify(report));
    assert.equal(report.filesystem.rule, "ledger-unattested");
    assert.equal(report.anchor, "committed");
  });
});

test("a committed entry for the exact commit attests the installed release", { skip }, () => {
  withBase((base) => {
    const { home, source, plan, digest } = installedRelease(base);
    writeLedger(plan.release, { [plan.commit]: digest });
    commitLedger(source, { [plan.commit]: digest });

    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "filesystem_installed", JSON.stringify(report));
    assert.equal(report.anchor, "committed");
    assert.equal(report.seal, "sealed");
  });
});
