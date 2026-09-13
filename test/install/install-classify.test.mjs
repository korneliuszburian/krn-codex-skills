import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyInstall, classifyTarget, createInstallPlan, declaredRuntimePaths } from "../../scripts/lib/install/install-release.mjs";

const sourceRoot = process.cwd();

test("declaredRuntimePaths requires and sorts the manifest field", () => {
  assert.deepEqual(declaredRuntimePaths({ runtime_paths: ["b", "a"] }), ["a", "b"]);
  assert.throws(() => declaredRuntimePaths({}), /missing runtime_paths/);
  assert.throws(() => declaredRuntimePaths({ runtime_paths: [] }), /missing runtime_paths/);
});

test("classifyTarget recognizes legacy source, foreign, and other-release links", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-classify-")));
  const source = join(base, "source");
  const relative = "skills/engineering/x";
  mkdirSync(join(source, relative), { recursive: true });
  const sourceFile = join(source, relative, "SKILL.md");
  writeFileSync(sourceFile, "x");
  const releaseRoot = join(base, "codex", "krn");
  const release = join(releaseRoot, "releases", "deadbeef");
  mkdirSync(join(release, relative), { recursive: true });
  const plan = { source: fs.realpathSync(source), releaseRoot, current: join(releaseRoot, "current"), release };
  const item = { label: "skill__x", target: join(base, "link"), relative };

  assert.equal(classifyTarget(plan, item, fs.realpathSync(join(source, relative))), "legacy_source");
  assert.equal(classifyTarget(plan, item, fs.realpathSync(join(release, relative))), "other_release");
  const foreign = join(base, "foreign.txt");
  writeFileSync(foreign, "y");
  assert.equal(classifyTarget(plan, item, fs.realpathSync(foreign)), "foreign");
  rmSync(base, { recursive: true, force: true });
});

test("classifyTarget recognizes the current release and a prior release", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-classify-prior-")));
  const previousSkills = process.env.KRN_SKILLS_DEST;
  const previousBins = process.env.KRN_BIN_DEST;
  process.env.KRN_SKILLS_DEST = join(base, "skills");
  process.env.KRN_BIN_DEST = join(base, "bin");
  try {
    const source = join(base, "source");
    mkdirSync(source);
    const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", source], { input: archive });
    execFileSync("git", ["-C", source, "init", "-q"]);
    const commit = (message) => {
      execFileSync("git", ["-C", source, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
      execFileSync("git", ["-C", source, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", message]);
      return execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    };
    commit("one");
    const home = join(base, "codex");
    const relative = "scripts/lib/support/diagnostics.mjs";
    const item = { label: "lib__diagnostics", target: join(base, "link"), relative };

    const planA = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(planA);
    assert.equal(classifyTarget(planA, item, fs.realpathSync(join(planA.current, relative))), "current");

    commit("two");
    const planB = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(planB);
    assert.equal(classifyTarget(planB, item, fs.realpathSync(join(planB.current, relative))), "current");
    assert.equal(classifyTarget(planB, item, fs.realpathSync(join(planA.release, relative))), "prior_release");
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
    rmSync(base, { recursive: true, force: true });
  }
});

test("classifyTarget refuses a matching file from an unrelated checkout", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-classify-fork-")));
  const source = join(base, "source");
  const relative = "skills/engineering/x/SKILL.md";
  mkdirSync(join(source, "skills", "engineering", "x"), { recursive: true });
  writeFileSync(join(source, relative), "x");
  const other = join(base, "other");
  mkdirSync(join(other, "skills", "engineering", "x"), { recursive: true });
  writeFileSync(join(other, relative), "y");
  execFileSync("git", ["-C", other, "init", "-q"]);
  const releaseRoot = join(base, "codex", "krn");
  const plan = { source: fs.realpathSync(source), releaseRoot, current: join(releaseRoot, "current"), release: "" };
  const item = { label: "skill__x", target: join(base, "link"), relative };
  assert.equal(classifyTarget(plan, item, fs.realpathSync(join(other, relative))), "foreign");
  rmSync(base, { recursive: true, force: true });
});
