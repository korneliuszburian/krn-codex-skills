import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { digestTree, verifyRelease } from "../../scripts/lib/install/install-inspect.mjs";
import { applyInstall, createInstallPlan } from "../../scripts/lib/install/install-release.mjs";

// The opinion's override findings, reproduced at the operator boundary: an
// override install must leave a durable audit record outside the release, must
// not seal the release with a ledger it wrote itself, and must not be reported
// as a plain install. Re-applying keeps the first actor, reason, and timestamp.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(sourceRoot, "scripts", "krn-codex.mjs");
const { hostCapabilities } = await import("../../scripts/lib/install/host-capabilities.mjs");

// This flow needs git and tar only; gating it on bwrap silently skipped the
// observer on hosts without bwrap and defeated its red-at-base proof.
const skip = hostCapabilities().gitChild ? false : "git is unavailable";

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];

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

const withBase = (body) => {
  const base = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), "krn-override-audit-")));
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

const overrideRecord = (home, commit) => JSON.parse(fs.readFileSync(path.join(home, "krn", "install-overrides", `${commit}.json`), "utf8"));

const releaseDigestsOf = (release) => {
  const file = path.join(release, "config", "release-digests.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")).digests ?? {};
};

const FIRST_ACTOR = "auditor@example.test";
const FIRST_REASON = "operator accepted an unsealed commit";

test("the override path records the first apply outside the release and leaves it unsealed", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = path.join(base, "codex");
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    const previousActor = process.env.KRN_OVERRIDE_ACTOR;
    const previousReason = process.env.KRN_OVERRIDE_REASON;
    process.env.KRN_OVERRIDE_ACTOR = FIRST_ACTOR;
    process.env.KRN_OVERRIDE_REASON = FIRST_REASON;
    try {
      applyInstall(plan, { allowUnsealed: true });

      const recordFile = path.join(home, "krn", "install-overrides", `${plan.commit}.json`);
      assert.ok(fs.existsSync(recordFile), `expected a durable override record at ${recordFile}`);
      assert.ok(!path.resolve(recordFile).startsWith(`${path.resolve(plan.release)}${path.sep}`), "the record must live outside the release");
      const record = overrideRecord(home, plan.commit);
      assert.equal(record.commit, plan.commit);
      assert.equal(record.actor, FIRST_ACTOR);
      assert.equal(record.reason, FIRST_REASON);
      assert.equal(record.digest, digestTree(plan.release).digest);
      assert.ok(!Number.isNaN(Date.parse(record.at)), `the first-apply timestamp must be a time: ${record.at}`);

      // The release is not self-sealed: apply must not have written a ledger
      // entry, so verification still depends on the repository ledger.
      assert.equal(releaseDigestsOf(plan.release)[plan.commit], undefined);
      assert.throws(() => verifyRelease(plan.release, plan.commit), /digest-unsealed/);
      assert.equal(verifyRelease(plan.release, plan.commit, { requireSealed: false }).commit, plan.commit);

      // A re-apply keeps the first record rather than silently replacing it.
      process.env.KRN_OVERRIDE_ACTOR = "second@example.test";
      process.env.KRN_OVERRIDE_REASON = "must not replace the first";
      applyInstall(plan, { allowUnsealed: true });
      const after = overrideRecord(home, plan.commit);
      assert.equal(after.at, record.at, "re-apply must not replace the first-apply timestamp");
      assert.equal(after.actor, FIRST_ACTOR, "re-apply must not replace the recorded actor");
      assert.equal(after.reason, FIRST_REASON, "re-apply must not replace the recorded reason");
    } finally {
      if (previousActor === undefined) delete process.env.KRN_OVERRIDE_ACTOR;
      else process.env.KRN_OVERRIDE_ACTOR = previousActor;
      if (previousReason === undefined) delete process.env.KRN_OVERRIDE_REASON;
      else process.env.KRN_OVERRIDE_REASON = previousReason;
    }
  });
});

test("install check surfaces the override instead of a plain installed state", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = path.join(base, "codex");
    const env = {
      ...process.env,
      CODEX_HOME: home,
      KRN_OVERRIDE_ACTOR: FIRST_ACTOR,
      KRN_OVERRIDE_REASON: FIRST_REASON,
    };
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, cwd: source });

    const commit = git(source, ["rev-parse", "HEAD"]);
    const applied = run("install", "apply", "--source", source, "--yes", "--json");
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).commit, commit);
    assert.equal(JSON.parse(applied.stdout).allowUnsealed, true);

    const checked = run("install", "check", "--json");
    assert.equal(checked.status, 3, checked.stderr);
    const report = JSON.parse(checked.stdout);
    assert.notEqual(report.filesystem.status, "filesystem_installed", checked.stdout);
    assert.equal(report.filesystem.status, "digest_unsealed");
    assert.equal(report.seal, "override_unsealed");
    assert.equal(report.override?.commit, commit, checked.stdout);
    assert.equal(report.override?.actor, FIRST_ACTOR);
    assert.equal(report.override?.reason, FIRST_REASON);
    assert.equal(report.filesystem.override?.actor, FIRST_ACTOR);
    assert.equal(report.filesystem.override?.at, report.override?.at);
  });
});
