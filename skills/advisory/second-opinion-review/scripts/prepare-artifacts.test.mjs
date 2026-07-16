import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));

function runHelper(args, env, executable = scriptPath) {
  return execFileSync(process.execPath, [executable, ...args], {
    encoding: "utf8",
    env,
  }).trim();
}

test("creates one unique private pass directory below the configured root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-artifacts-test-"));
  const root = path.join(sandbox, "owned-root");

  try {
    const configuredEnv = {
      ...process.env,
      SECOND_OPINION_ARTIFACT_ROOT: root,
    };
    const first = runHelper(["matt-skills-audit"], configuredEnv);
    const second = runHelper(["matt-skills-audit"], configuredEnv);

    assert.equal(path.dirname(first), root);
    assert.equal(path.dirname(second), root);
    assert.notEqual(first, second);
    assert.match(path.basename(first), /^\d{4}-\d{2}-\d{2}-matt-skills-audit-/);
    assert.equal(fs.statSync(first).mode & 0o777, 0o700);

    const stateEnv = { ...process.env, XDG_STATE_HOME: sandbox };
    delete stateEnv.SECOND_OPINION_ARTIFACT_ROOT;
    const fromStateHome = runHelper(["checker-pass"], stateEnv);
    assert.equal(
      path.dirname(fromStateHome),
      path.join(sandbox, "krn", "second-opinion-review"),
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("runs through an installed-style parent-directory symlink", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-symlink-test-"));
  const installedSkill = path.join(sandbox, "second-opinion-review");
  const root = path.join(sandbox, "owned-root");

  try {
    fs.symlinkSync(path.dirname(path.dirname(scriptPath)), installedSkill, "dir");
    const installedScript = path.join(installedSkill, "scripts", "prepare-artifacts.mjs");
    const passDirectory = runHelper(["installed-path"], {
      ...process.env,
      SECOND_OPINION_ARTIFACT_ROOT: root,
    }, installedScript);

    assert.equal(path.dirname(passDirectory), root);
    assert.equal(fs.statSync(passDirectory).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects ambiguous roots and pass names", () => {
  const relativeRoot = spawnSync(process.execPath, [scriptPath, "review"], {
    encoding: "utf8",
    env: { ...process.env, SECOND_OPINION_ARTIFACT_ROOT: "relative/reviews" },
  });
  assert.equal(relativeRoot.status, 64);
  assert.match(relativeRoot.stderr, /must be absolute/);

  const invalidSlug = spawnSync(process.execPath, [scriptPath, "Review Artifacts"], {
    encoding: "utf8",
    env: { ...process.env, SECOND_OPINION_ARTIFACT_ROOT: os.tmpdir() },
  });
  assert.equal(invalidSlug.status, 64);
  assert.match(invalidSlug.stderr, /slug must use lowercase/);
});
