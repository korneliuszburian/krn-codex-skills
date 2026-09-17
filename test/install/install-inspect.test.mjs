import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { applyInstall, createInstallPlan, inspectInstall, pruneReleases } from "../../scripts/lib/install/install-release.mjs";

const sourceRoot = process.cwd();

const cleanSource = (base) => {
  const copy = join(base, "source");
  mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(copy);
};

const withHome = (body) => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-inspect-")));
  const home = join(base, "codex");
  mkdirSync(home, { recursive: true });
  const previousSkills = process.env.KRN_SKILLS_DEST;
  const previousBins = process.env.KRN_BIN_DEST;
  const previousOpencode = process.env.KRN_OPENCODE_DEST;
  process.env.KRN_SKILLS_DEST = join(base, "skills");
  process.env.KRN_BIN_DEST = join(base, "bin");
  process.env.KRN_OPENCODE_DEST = join(base, "opencode");
  try {
    body({ base, home });
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
    if (previousOpencode === undefined) delete process.env.KRN_OPENCODE_DEST;
    else process.env.KRN_OPENCODE_DEST = previousOpencode;
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

test("inspectInstall reports missing, broken, foreign, and masked states", () => {
  withHome(({ home }) => {
    assert.equal(inspectInstall({ codexHome: home }).filesystem.status, "missing");

    const releaseRoot = join(home, "krn");
    mkdirSync(releaseRoot, { recursive: true });
    symlinkSync(join(releaseRoot, "releases", "gone"), join(releaseRoot, "current"));
    assert.equal(inspectInstall({ codexHome: home }).filesystem.status, "broken_link");

    fs.rmSync(join(releaseRoot, "current"));
    mkdirSync(join(releaseRoot, "current"));
    assert.equal(inspectInstall({ codexHome: home }).filesystem.status, "foreign_collision");

    fs.rmSync(join(releaseRoot, "current"), { recursive: true, maxRetries: 10, retryDelay: 50 });
    writeFileSync(join(home, "AGENTS.override.md"), "x\n");
    assert.equal(inspectInstall({ codexHome: home }).filesystem.status, "masked_by_override");
  });
});

test("applyInstall rolls back reconciled targets when a later step fails", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    const first = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(first);
    const before = inspectInstall({ codexHome: home });
    // A day-one apply has no repository seal, so it is an audited override
    // rather than a self-sealed release.
    assert.equal(before.filesystem.status, "digest_unsealed");
    assert.equal(before.seal, "override_unsealed");
    assert.ok(before.override, JSON.stringify(before));

    const firstTarget = before.targets[0];
    const itemRelative = relative(first.current, fs.readlinkSync(firstTarget.target));
    fs.unlinkSync(firstTarget.target);
    fs.symlinkSync(join(first.release, itemRelative), firstTarget.target);

    execFileSync("git", ["-C", source, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "next"]);
    const next = createInstallPlan({ source, cwd: source, codexHome: home });
    process.env.KRN_TEST_FAIL_DURING_RECONCILE = "1";
    try {
      assert.throws(() => applyInstall(next), /injected reconciliation failure/);
    } finally {
      delete process.env.KRN_TEST_FAIL_DURING_RECONCILE;
    }

    const after = inspectInstall({ codexHome: home });
    assert.equal(after.filesystem.status, "digest_unsealed");
    assert.equal(after.seal, "override_unsealed");
    assert.equal(after.commit, first.commit);
    assert.ok(after.targets.length > 0, "the rollback still enumerates targets");
    assert.ok(after.targets.every((target) => target.status === "filesystem_installed"));
  });
});

test("inspectInstall reports an audited override after a real apply", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan);
    const report = inspectInstall({ codexHome: home });
    assert.equal(report.filesystem.status, "digest_unsealed");
    assert.equal(report.seal, "override_unsealed");
    assert.ok(report.override, JSON.stringify(report));
    assert.equal(report.commit, plan.commit);
    assert.ok(report.targets.length > 0);
    assert.ok(report.targets.every((target) => target.status === "filesystem_installed"));
  });
});

test("a legacy global hook path blocks apply and is surfaced by inspect", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    applyInstall(createInstallPlan({ source, cwd: source, codexHome: home }));
    fs.mkdirSync(join(home, "hooks"), { recursive: true });
    writeFileSync(join(home, "hooks", "rtk_pretooluse.py"), "legacy\n");
    const report = inspectInstall({ codexHome: home });
    assert.equal(report.filesystem.status, "legacy_hook_conflict");
    assert.ok(report.legacyHooks.some((target) => target.endsWith("hooks/rtk_pretooluse.py")));
    assert.throws(
      () => applyInstall(createInstallPlan({ source, cwd: source, codexHome: home })),
      /legacy global hook path/,
    );
  });
});

test("applyInstall refuses a symlinked managed destination root", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    const elsewhere = join(base, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(base, "skills"));
    assert.throws(
      () => applyInstall(createInstallPlan({ source, cwd: source, codexHome: home })),
      /symlinked managed destination root/,
    );
  });
});

test("pruneReleases keeps the newest N plus the current target", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-prune-")));
  const releaseRoot = join(base, "krn");
  const releases = join(releaseRoot, "releases");
  for (const [index, name] of ["old1", "old2", "new1"].entries()) {
    mkdirSync(join(releases, name), { recursive: true });
    fs.utimesSync(join(releases, name), new Date(index * 1000), new Date(index * 1000));
  }
  mkdirSync(releaseRoot, { recursive: true });
  symlinkSync(join("releases", "new1"), join(releaseRoot, "current"));
  const report = pruneReleases({ codexHome: base, keep: 1 });
  assert.deepEqual(report.removed.sort(), ["old1", "old2"], JSON.stringify(report));
  assert.ok(fs.existsSync(join(releases, "new1")));
  assert.ok(!fs.existsSync(join(releases, "old1")));
  rmSync(base, { recursive: true, force: true });
});

test("a legacy hook is reported before any release exists", () => {
  withHome(({ home }) => {
    fs.mkdirSync(join(home, "hooks"), { recursive: true });
    writeFileSync(join(home, "hooks", "rtk_pretooluse.py"), "legacy\n");
    const report = inspectInstall({ codexHome: home });
    assert.equal(report.filesystem.status, "legacy_hook_conflict");
    assert.ok(report.legacyHooks.length > 0, JSON.stringify(report.legacyHooks));
  });
});

test("pruneReleases retains a release referenced by a managed link", () => {
  withHome(({ base, home }) => {
    const releaseRoot = join(home, "krn");
    const releases = join(releaseRoot, "releases");
    for (const [index, name] of ["old", "new"].entries()) {
      mkdirSync(join(releases, name, "skills"), { recursive: true });
      fs.utimesSync(join(releases, name), new Date(index * 1000), new Date(index * 1000));
    }
    writeFileSync(join(releases, "old", "skills", "x"), "x\n");
    mkdirSync(join(base, "skills"), { recursive: true });
    symlinkSync(join(releases, "old", "skills", "x"), join(base, "skills", "x"));
    mkdirSync(releaseRoot, { recursive: true });
    symlinkSync(join("releases", "new"), join(releaseRoot, "current"));
    const report = pruneReleases({ codexHome: home, keep: 1 });
    assert.ok(report.kept.includes("old"), JSON.stringify(report));
    assert.ok(fs.existsSync(join(releases, "old")));
  });
});

test("inspectInstall reports a symlinked managed destination root as a collision", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    applyInstall(createInstallPlan({ source, cwd: source, codexHome: home }));
    const dest = process.env.KRN_SKILLS_DEST;
    fs.renameSync(dest, `${dest}-real`);
    symlinkSync(`${dest}-real`, dest);
    assert.equal(inspectInstall({ codexHome: home }).filesystem.status, "foreign_collision");
  });
});

test("pruneReleases refuses a symlinked releases root and a non-directory", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-prune-")));
  const home = join(base, "home");
  mkdirSync(join(home, "krn"), { recursive: true });
  mkdirSync(join(base, "victim", "old"), { recursive: true });
  symlinkSync(join(base, "victim"), join(home, "krn", "releases"));
  const symlinked = pruneReleases({ codexHome: home, keep: 1 });
  assert.deepEqual(symlinked.removed, []);
  assert.ok(symlinked.refused, JSON.stringify(symlinked));
  assert.ok(fs.existsSync(join(base, "victim", "old")), "a symlinked releases root must not delete outside the store");
  rmSync(join(home, "krn", "releases"), { force: true });
  writeFileSync(join(home, "krn", "releases"), "not a directory");
  let notDirectory;
  assert.doesNotThrow(() => { notDirectory = pruneReleases({ codexHome: home }); });
  assert.ok(notDirectory.refused, JSON.stringify(notDirectory));
  rmSync(base, { recursive: true, force: true });
});

test("a managed destination root with a trailing slash is accepted", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    process.env.KRN_SKILLS_DEST = `${process.env.KRN_SKILLS_DEST}/`;
    assert.doesNotThrow(() => applyInstall(createInstallPlan({ source, cwd: source, codexHome: home })));
  });
});

test("managedTargets tolerates a missing manifest", async () => {
  const { managedTargets } = await import("../../scripts/lib/install/install-release.mjs");
  assert.deepEqual(managedTargets({ releaseRoot: "/tmp/krn-none", manifest: null }), []);
});

test("applyInstall refuses a symlinked release store root", () => {
  withHome(({ base, home }) => {
    mkdirSync(join(home, "krn"), { recursive: true });
    mkdirSync(join(base, "evil"), { recursive: true });
    symlinkSync(join(base, "evil"), join(home, "krn", "releases"));
    const source = cleanSource(base);
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    assert.throws(() => applyInstall(plan), /release store root must be a real directory/);
  });
});
