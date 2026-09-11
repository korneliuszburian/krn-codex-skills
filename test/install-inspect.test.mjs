import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { applyInstall, createInstallPlan, inspectInstall } from "../scripts/lib/install-release.mjs";

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
  process.env.KRN_SKILLS_DEST = join(base, "skills");
  process.env.KRN_BIN_DEST = join(base, "bin");
  try {
    body({ base, home });
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
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
    assert.equal(before.filesystem.status, "filesystem_installed");

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
    assert.equal(after.filesystem.status, "filesystem_installed");
    assert.equal(after.commit, first.commit);
    assert.ok(after.targets.every((target) => target.status === "filesystem_installed"));
  });
});

test("inspectInstall reports filesystem_installed after a real apply", () => {
  withHome(({ base, home }) => {
    const source = cleanSource(base);
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan);
    const report = inspectInstall({ codexHome: home });
    assert.equal(report.filesystem.status, "filesystem_installed");
    assert.equal(report.commit, plan.commit);
    assert.ok(report.targets.length > 0);
    assert.ok(report.targets.every((target) => target.status === "filesystem_installed"));
  });
});
