import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  listPasses,
  prepareArtifactDirectory,
  resolveArtifactRoot,
  verifyPassDirectory,
} from "./prepare-artifacts.mjs";

const scriptPath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));
const skillRoot = path.dirname(path.dirname(scriptPath));

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function isolatedEnv(values = {}) {
  const env = { ...process.env, ...values };
  delete env.SECOND_OPINION_CONTEXT_ROOT;
  delete env.SECOND_OPINION_WORKING_RUNS;
  return { ...env, ...values };
}

function initializeRepository(root, { ignoredRuns = true } = {}) {
  run("git", ["init", "-q"], root);
  run("git", ["config", "user.name", "artifact-test"], root);
  run("git", ["config", "user.email", "artifact@example.invalid"], root);
  const runs = path.join(root, ".krn", "runs");
  fs.mkdirSync(runs, { recursive: true });
  if (ignoredRuns) fs.writeFileSync(path.join(runs, ".gitignore"), "*\n!.gitignore\n");
  if (ignoredRuns) run("git", ["add", ".krn/runs/.gitignore"], root);
  run("git", ["commit", "-q", "--allow-empty", "-m", "configure runs"], root);
}

test("explicit context resolves canonical ignored repository runs from an unrelated cwd without changing Git status", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-context-test-"));
  const repository = path.join(sandbox, "repository");
  const unrelated = path.join(sandbox, "unrelated");
  try {
    fs.mkdirSync(repository);
    fs.mkdirSync(unrelated);
    initializeRepository(repository);
    const env = isolatedEnv({
      SECOND_OPINION_CONTEXT_ROOT: repository,
      SECOND_OPINION_WORKING_RUNS: path.join(sandbox, "ad-hoc-only"),
    });
    const before = run("git", ["status", "--porcelain"], repository);
    const result = spawnSync(
      process.execPath,
      [scriptPath, "configured", "check"],
      { cwd: unrelated, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const pass = result.stdout.trim();
    assert.equal(
      path.dirname(pass),
      path.join(repository, ".krn", "runs", "second-opinion-review"),
    );
    assert.match(path.basename(pass), /^\d{4}-\d{2}-\d{2}-check-configured-[A-Za-z0-9]{6}$/);
    assert.equal(fs.statSync(path.dirname(pass)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(pass).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(pass, "pass-context.json")).mode & 0o777, 0o600);
    assert.equal(run("git", ["status", "--porcelain"], repository), before);

    const verified = verifyPassDirectory({
      passDirectory: pass,
      expectedRole: "check",
      env,
    });
    assert.equal(verified.context.schema_version, 2);
    assert.equal(verified.context.resolution.kind, "repository");
    const cliVerification = spawnSync(
      process.execPath,
      [scriptPath, "verify-pass", pass, "check"],
      { cwd: unrelated, env, encoding: "utf8" },
    );
    assert.equal(cliVerification.status, 0, cliVerification.stderr);
    assert.equal(cliVerification.stdout, `valid second-opinion pass: ${pass}\n`);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("a context without a repository requires an explicit absolute working-runs root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-required-root-test-"));
  try {
    assert.throws(
      () => resolveArtifactRoot({ cwd: sandbox, env: isolatedEnv() }),
      /SECOND_OPINION_WORKING_RUNS must be an absolute path/,
    );
    assert.throws(
      () => resolveArtifactRoot({
        cwd: sandbox,
        env: isolatedEnv({ SECOND_OPINION_WORKING_RUNS: "relative/runs" }),
      }),
      /must be an absolute path/,
    );
    assert.throws(
      () => resolveArtifactRoot({
        cwd: sandbox,
        env: isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: "relative/context" }),
      }),
      /CONTEXT_ROOT must be an absolute/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects canonical repository runs that cross a symlink", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-runs-symlink-test-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-runs-outside-"));
  try {
    run("git", ["init", "-q"], sandbox);
    fs.symlinkSync(outside, path.join(sandbox, ".krn"));
    assert.throws(() => resolveArtifactRoot({ cwd: sandbox }), /inside the repository/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects a symlink alias even when canonical repository runs stay inside the repository", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-runs-alias-test-"));
  try {
    run("git", ["init", "-q"], repository);
    fs.mkdirSync(path.join(repository, "private-state"));
    fs.symlinkSync("private-state", path.join(repository, ".krn"));

    assert.throws(
      () => resolveArtifactRoot({ cwd: repository, env: isolatedEnv() }),
      /canonical repository path without symlinks/,
    );
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test("a legacy artifact registry cannot redirect canonical repository runs", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-no-resolver-test-"));
  try {
    initializeRepository(repository);
    fs.mkdirSync(path.join(repository, "docs", "agents"), { recursive: true });
    fs.writeFileSync(
      path.join(repository, "docs", "agents", "artifact-paths.json"),
      "not valid json\n",
    );
    assert.equal(
      resolveArtifactRoot({ cwd: repository, env: isolatedEnv() }),
      path.join(repository, ".krn", "runs", "second-opinion-review"),
    );
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test("an explicit external working-runs root uses the same flat role layout", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-artifacts-test-"));
  const context = path.join(sandbox, "context");
  const workingRuns = path.join(sandbox, "working-runs");
  try {
    fs.mkdirSync(context);
    const env = isolatedEnv({ SECOND_OPINION_WORKING_RUNS: workingRuns });
    const first = prepareArtifactDirectory({
      slug: "matt-skills-audit",
      role: "research",
      cwd: context,
      env,
      now: new Date("2026-07-29T12:00:00Z"),
    });
    const second = prepareArtifactDirectory({
      slug: "matt-skills-audit",
      role: "research",
      cwd: context,
      env,
      now: new Date("2026-07-29T12:00:00Z"),
    });

    assert.equal(path.dirname(first), path.join(workingRuns, "second-opinion-review"));
    assert.notEqual(first, second);
    assert.match(
      path.basename(first),
      /^2026-07-29-research-matt-skills-audit-[A-Za-z0-9]{6}$/,
    );
    assert.equal(fs.statSync(first).mode & 0o777, 0o700);
    assert.equal(
      fs.statSync(path.join(workingRuns, "second-opinion-review")).mode & 0o777,
      0o700,
    );
    assert.equal(
      verifyPassDirectory({ passDirectory: first, expectedRole: "research", env }).role,
      "research",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("an explicit working root inside another repository must be Git-ignored", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-owner-test-"));
  const context = path.join(sandbox, "context");
  const repository = path.join(sandbox, "repository");
  const workingRuns = path.join(repository, ".agent-runs");
  try {
    fs.mkdirSync(context);
    fs.mkdirSync(repository);
    run("git", ["init", "-q"], repository);
    run("git", ["config", "user.name", "owner-test"], repository);
    run("git", ["config", "user.email", "owner@example.invalid"], repository);
    const env = isolatedEnv({ SECOND_OPINION_WORKING_RUNS: workingRuns });
    assert.throws(
      () => prepareArtifactDirectory({ slug: "unsafe", role: "check", cwd: context, env }),
      /must be ignored by Git/,
    );

    fs.writeFileSync(path.join(repository, ".gitignore"), ".agent-runs/\n");
    const pass = prepareArtifactDirectory({
      slug: "safe",
      role: "check",
      cwd: context,
      env,
    });
    const verified = verifyPassDirectory({ passDirectory: pass, expectedRole: "check", env });
    assert.equal(verified.context.resolution.artifact_repository_root, repository);

    fs.writeFileSync(
      path.join(repository, ".gitignore"),
      `.agent-runs/second-opinion-review/${path.basename(pass)}/\n`,
    );
    assert.throws(
      () => verifyPassDirectory({ passDirectory: pass, expectedRole: "check", env }),
      /must be ignored by Git/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("verification rejects a pass moved away from its fixed repository identity", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-pass-move-test-"));
  try {
    initializeRepository(sandbox);
    const env = isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: sandbox });
    const pass = prepareArtifactDirectory({
      slug: "fixed-context",
      role: "check",
      cwd: sandbox,
      env,
    });
    const movedRoot = path.join(sandbox, ".other-runs", "second-opinion-review");
    fs.mkdirSync(movedRoot, { recursive: true, mode: 0o700 });
    const moved = path.join(movedRoot, path.basename(pass));
    fs.renameSync(pass, moved);
    assert.throws(
      () => verifyPassDirectory({ passDirectory: moved, expectedRole: "check", env }),
      /pass context does not match its directory layout/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("creation requires a valid slug and one exact role", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-role-test-"));
  try {
    const env = isolatedEnv({ SECOND_OPINION_WORKING_RUNS: path.join(root, "runs") });
    assert.throws(
      () => prepareArtifactDirectory({ slug: "Bad Slug", role: "check", cwd: root, env }),
      /slug must use lowercase/,
    );
    for (const role of [undefined, "passes", "checker", "Research"]) {
      assert.throws(
        () => prepareArtifactDirectory({ slug: "ok", role, cwd: root, env }),
        /role must be research, rewrite, or check/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("list enumerates flat normalized passes by role with job state", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-list-test-"));
  const workingRuns = path.join(sandbox, "runs");
  try {
    const env = isolatedEnv({ SECOND_OPINION_WORKING_RUNS: workingRuns });
    const alpha = prepareArtifactDirectory({
      slug: "alpha",
      role: "research",
      cwd: sandbox,
      env,
      now: new Date("2026-07-28T12:00:00Z"),
    });
    prepareArtifactDirectory({
      slug: "beta",
      role: "check",
      cwd: sandbox,
      env,
      now: new Date("2026-07-29T12:00:00Z"),
    });

    fs.mkdirSync(path.join(alpha, "jobs"));
    fs.writeFileSync(
      path.join(alpha, "jobs", "alpha.job.json"),
      `${JSON.stringify({ state: "complete" })}\n`,
    );

    const passes = listPasses({ cwd: sandbox, env });
    assert.equal(passes.length, 2);
    assert.deepEqual(
      passes.map((p) => `${p.role}/${p.state}`),
      ["research/complete", "check/unknown"],
    );

    const cli = spawnSync(process.execPath, [scriptPath, "list"], {
      cwd: sandbox,
      env,
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /^role\tpass\tstate\n/);
    assert.match(cli.stdout, /research\t2026-07-28-research-alpha-/);
    assert.match(cli.stdout, /check\t2026-07-29-check-beta-/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("runs through an installed-style symlink", async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-symlink-test-"));
  const installedSkill = path.join(sandbox, "second-opinion-review");
  try {
    fs.symlinkSync(skillRoot, installedSkill, "dir");
    const installedScript = path.join(installedSkill, "scripts", "prepare-artifacts.mjs");
    const mod = await import(pathToFileURL(installedScript).href);
    const env = isolatedEnv({
      SECOND_OPINION_WORKING_RUNS: path.join(sandbox, "working-runs"),
    });
    const pass = mod.prepareArtifactDirectory({
      slug: "installed",
      role: "check",
      cwd: sandbox,
      env,
    });
    assert.equal(
      path.dirname(pass),
      path.join(sandbox, "working-runs", "second-opinion-review"),
    );
    assert.equal(fs.statSync(pass).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the CLI prints usage and exits non-zero with bad arguments", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-cli-test-"));
  const env = isolatedEnv({
    SECOND_OPINION_WORKING_RUNS: path.join(sandbox, "working-runs"),
  });
  const noArgs = spawnSync(process.execPath, [scriptPath], {
    cwd: sandbox,
    env,
    encoding: "utf8",
  });
  assert.equal(noArgs.status, 64);
  assert.match(noArgs.stderr, /usage: prepare-artifacts\.mjs/);

  const badSlug = spawnSync(process.execPath, [scriptPath, "Bad Slug", "check"], {
    cwd: sandbox,
    env,
    encoding: "utf8",
  });
  assert.equal(badSlug.status, 64);
  assert.match(badSlug.stderr, /slug must use lowercase/);

  const badRole = spawnSync(process.execPath, [scriptPath, "valid", "passes"], {
    cwd: sandbox,
    env,
    encoding: "utf8",
  });
  assert.equal(badRole.status, 64);
  assert.match(badRole.stderr, /role must be research, rewrite, or check/);

  fs.rmSync(sandbox, { recursive: true, force: true });
});
