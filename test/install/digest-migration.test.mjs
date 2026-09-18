import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The observer is host-independent: it builds its own temporary CODEX_HOME and
// its own source copy. Its red is the missing upgrade path: a release whose
// committed metadata digest matches the pre-sh-56 algorithm is reported as
// `release-corrupt`, so the classification case fails at base. The fix names it
// `release_superseded` with rule `digest-legacy` and keeps apply working.
const { digestTree, legacyDigestTree, inspectInstall } = await import("../../scripts/lib/install/install-inspect.mjs");
const { applyInstall, createInstallPlan } = await import("../../scripts/lib/install/install-release.mjs");
const { hostCapabilities } = await import("../../scripts/lib/install/host-capabilities.mjs");

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
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-digest-migration-")));
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

const writeMetadataDigest = (release, digest) => {
  const file = join(release, ".krn-release.json");
  const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  metadata.digest = digest;
  fs.writeFileSync(file, `${JSON.stringify(metadata, null, 2)}\n`);
};

test("a release sealed under the earlier digest algorithm is superseded and replaceable", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = join(base, "codex");
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan, { allowUnsealed: true });

    // Force the executable bit onto a hashed file so the legacy spelling (which
    // includes it) is genuinely distinct from the content-only spelling.
    fs.chmodSync(join(plan.release, "scripts", "krn.mjs"), 0o755);
    const legacy = legacyDigestTree(plan.release).digest;
    assert.notEqual(legacy, digestTree(plan.release).digest, "the two digest spellings must differ");
    writeMetadataDigest(plan.release, legacy);

    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "release_superseded");
    assert.equal(report.filesystem.rule, "digest-legacy");
    assert.doesNotMatch(report.filesystem.detail ?? "", /corrupt/);

    // apply replaces the superseded current with an advanced target and never
    // touches the host's filesystem by hand.
    fs.appendFileSync(join(source, "scripts", "krn.mjs"), "\n");
    git(source, [...identity, "commit", "-q", "-am", "advance"]);
    const next = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(next, { allowUnsealed: true });
    assert.equal(fs.realpathSync(next.current), fs.realpathSync(next.release), "apply switches current");
  });
});

test("a release matching neither digest spelling stays corrupt", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = join(base, "codex");
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan, { allowUnsealed: true });
    writeMetadataDigest(plan.release, "0".repeat(64));

    const report = inspectInstall({ codexHome: home, source });
    assert.equal(report.filesystem.status, "release_corrupt");
    assert.equal(report.filesystem.rule, "release-corrupt");
  });
});
