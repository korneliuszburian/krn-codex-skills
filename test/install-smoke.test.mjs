import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applyInstall, createInstallPlan, installExitCodes } from "../scripts/lib/install-release.mjs";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));

test("the install shim dispatches check and rejects an unknown mode", () => {
  const shim = path.join(sourceRoot, "scripts", "install.sh");
  const bad = spawnSync("bash", [shim, "bogus"], { encoding: "utf8" });
  assert.equal(bad.status, 64);
  assert.match(bad.stderr, /usage: install\.sh/);
  const check = spawnSync("bash", [shim, "check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
});

test("apply fails closed and restores current when the installed CLI cannot start", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-smoke-"));
  const copy = path.join(base, "source");
  fs.mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  fs.appendFileSync(path.join(copy, "scripts", "lib", "diagnostics.mjs"), '\nthrow new Error("krn smoke failure");\n');
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "break the installed CLI start"]);

  const home = path.join(base, "codex");
  const previousSkills = process.env.KRN_SKILLS_DEST;
  const previousBins = process.env.KRN_BIN_DEST;
  process.env.KRN_SKILLS_DEST = path.join(base, "skills");
  process.env.KRN_BIN_DEST = path.join(base, "bin");
  try {
    const plan = createInstallPlan({ source: copy, cwd: copy, codexHome: home });
    assert.ok(plan.runtimePaths.includes("scripts/lib/diagnostics.mjs"));
    assert.throws(
      () => applyInstall(plan),
      (error) => error.exitCode === installExitCodes.EXIT_CORRUPT && /smoke failed/.test(error.message),
    );
    assert.equal(fs.lstatSync(plan.current, { throwIfNoEntry: false }), undefined);
    assert.ok(fs.existsSync(plan.release));
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
    fs.rmSync(base, { recursive: true, force: true });
  }
});
