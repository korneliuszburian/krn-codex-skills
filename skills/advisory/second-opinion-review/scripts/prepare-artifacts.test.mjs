import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  inspectLegacyPass,
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

function makeLegacyPass(root, { state = "complete" } = {}) {
  const workingRunsRoot = path.join(root, "reviews");
  const artifactRoot = path.join(workingRunsRoot, "second-opinion-review");
  const passDirectory = path.join(
    artifactRoot,
    "2026-07-29-check-legacy-closure-Ab12Cd",
  );
  fs.mkdirSync(passDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(artifactRoot, 0o700);
  fs.chmodSync(passDirectory, 0o700);
  const context = {
    schema_version: 1,
    workflow: "second-opinion-review",
    role: "check",
    slug: "legacy-closure",
    pass_id: path.basename(passDirectory),
    pass_directory: passDirectory,
    working_runs_root: workingRunsRoot,
    artifact_root: artifactRoot,
    resolution: {
      kind: "explicit-working-runs",
      context_root: root,
      repository_root: null,
      artifact_repository_root: null,
      config_path: null,
      configured_working_runs: null,
    },
  };
  fs.writeFileSync(
    path.join(passDirectory, "pass-context.json"),
    `${JSON.stringify(context, null, 2)}\n`,
    { mode: 0o600 },
  );
  if (state !== null) {
    const jobs = path.join(passDirectory, "jobs");
    fs.mkdirSync(jobs);
    fs.writeFileSync(
      path.join(jobs, "checker.job.json"),
      `${JSON.stringify({ job_version: "1", role: "checker", state })}\n`,
    );
  }
  return { passDirectory, context };
}

function makeLegacyConfiguredPass(root) {
  const workingRunsRoot = path.join(root, "private-runs");
  const configuredWorkingRuns = path.join(root, "linked-runs");
  fs.mkdirSync(workingRunsRoot);
  fs.symlinkSync("private-runs", configuredWorkingRuns, "dir");
  const artifactRoot = path.join(workingRunsRoot, "second-opinion-review");
  const passDirectory = path.join(
    artifactRoot,
    "2026-07-29-check-linked-legacy-Ab12Cd",
  );
  fs.mkdirSync(passDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(artifactRoot, 0o700);
  fs.chmodSync(passDirectory, 0o700);
  const context = {
    schema_version: 1,
    workflow: "second-opinion-review",
    role: "check",
    slug: "linked-legacy",
    pass_id: path.basename(passDirectory),
    pass_directory: passDirectory,
    working_runs_root: workingRunsRoot,
    artifact_root: artifactRoot,
    resolution: {
      kind: "repository-config",
      context_root: root,
      repository_root: root,
      artifact_repository_root: root,
      config_path: path.join(root, "docs", "agents", "artifact-paths.json"),
      configured_working_runs: "linked-runs",
    },
  };
  fs.writeFileSync(
    path.join(passDirectory, "pass-context.json"),
    `${JSON.stringify(context, null, 2)}\n`,
    { mode: 0o600 },
  );
  return passDirectory;
}

function writeResearchCampaign(passDirectory, shardIds) {
  const researchIds = shardIds.filter((id) => id !== "synthesis");
  const campaign = {
    campaign_version: "1",
    campaign_id: "alpha",
    objective: "Exercise conservative pass-state aggregation.",
    sources: [
      {
        id: "repository",
        kind: "repository",
        locator: ".",
        revision: "a".repeat(40),
        authority: "local",
        purpose: "Provide one fixed source.",
        required: true,
      },
    ],
    shards: shardIds.map((id) => ({
      id,
      kind: id === "synthesis" ? "synthesis" : "research",
      objective: `Complete ${id}.`,
      source_ids: ["repository"],
      depends_on: id === "synthesis" ? researchIds : [],
      deliverable: `${id} result.`,
    })),
    human_decisions: [],
    does_not_prove: ["Job state does not prove acceptance."],
  };
  fs.writeFileSync(
    path.join(passDirectory, "campaign.json"),
    `${JSON.stringify(campaign, null, 2)}\n`,
  );
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
    assert.equal(verified.context.schema_version, 3);
    assert.equal(verified.context.resolution.kind, "repository");
    assert.equal(verified.context.resolution.context_path, ".");
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

test("verification rejects a pass moved outside its canonical repository run root", () => {
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
      /outside the repository's canonical \.krn\/runs root/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("repository pass survives moving the entire owning checkout", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-checkout-move-test-"));
  const original = path.join(sandbox, "original-repository");
  const moved = path.join(sandbox, "moved-repository");
  try {
    fs.mkdirSync(original);
    initializeRepository(original);
    const pass = prepareArtifactDirectory({
      slug: "portable-context",
      role: "research",
      cwd: original,
      env: isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: original }),
    });
    const relativePass = path.relative(original, pass);

    fs.renameSync(original, moved);
    const movedPass = path.join(moved, relativePass);
    const movedEnv = isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: moved });
    const verified = verifyPassDirectory({
      passDirectory: movedPass,
      expectedRole: "research",
      env: movedEnv,
    });

    assert.equal(verified.passDirectory, movedPass);
    assert.equal(verified.context.resolution.context_path, ".");
    assert.equal(listPasses({ cwd: moved, env: movedEnv })[0].state, "unknown");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("repository ownership does not persist an ephemeral invocation subdirectory", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-subdir-owner-"));
  const nested = path.join(repository, "packages", "temporary");
  try {
    initializeRepository(repository);
    fs.mkdirSync(nested, { recursive: true });
    const pass = prepareArtifactDirectory({
      slug: "root-owned",
      role: "check",
      cwd: nested,
      env: isolatedEnv(),
    });
    fs.rmSync(path.join(repository, "packages"), { recursive: true, force: true });

    const verified = verifyPassDirectory({
      passDirectory: pass,
      expectedRole: "check",
      env: isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: repository }),
    });
    assert.equal(verified.context.resolution.context_path, ".");
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test("repository anchor rejects copying a pass into another repository", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-cross-repo-test-"));
  const source = path.join(sandbox, "source");
  const target = path.join(sandbox, "target");
  try {
    fs.mkdirSync(source);
    fs.mkdirSync(target);
    initializeRepository(source);
    initializeRepository(target);
    fs.writeFileSync(path.join(source, "source-only.txt"), "source identity\n");
    run("git", ["add", "source-only.txt"], source);
    run("git", ["commit", "-qm", "source identity"], source);

    const sourcePass = prepareArtifactDirectory({
      slug: "owned-source",
      role: "check",
      cwd: source,
      env: isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: source }),
    });
    const targetEnv = isolatedEnv({ SECOND_OPINION_CONTEXT_ROOT: target });
    const targetPlaceholder = prepareArtifactDirectory({
      slug: "target-placeholder",
      role: "check",
      cwd: target,
      env: targetEnv,
    });
    fs.rmSync(targetPlaceholder, { recursive: true, force: true });
    const copiedPass = path.join(
      target,
      ".krn",
      "runs",
      "second-opinion-review",
      path.basename(sourcePass),
    );
    fs.cpSync(sourcePass, copiedPass, { recursive: true });
    fs.chmodSync(copiedPass, 0o700);
    fs.chmodSync(path.join(copiedPass, "pass-context.json"), 0o600);

    assert.throws(
      () => verifyPassDirectory({
        passDirectory: copiedPass,
        expectedRole: "check",
        env: targetEnv,
      }),
      /repository identity changed/,
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
    const beta = prepareArtifactDirectory({
      slug: "beta",
      role: "check",
      cwd: sandbox,
      env,
      now: new Date("2026-07-29T12:00:00Z"),
    });
    const gamma = prepareArtifactDirectory({
      slug: "gamma",
      role: "research",
      cwd: sandbox,
      env,
      now: new Date("2026-07-30T12:00:00Z"),
    });

    writeResearchCampaign(alpha, ["alpha", "z-complete"]);
    fs.mkdirSync(path.join(alpha, "jobs"));
    fs.writeFileSync(
      path.join(alpha, "jobs", "alpha.job.json"),
      `${JSON.stringify({
        job_version: "1",
        campaign_id: "alpha",
        shard_id: "alpha",
        state: "failed",
      })}\n`,
    );
    fs.writeFileSync(
      path.join(alpha, "jobs", "z-complete.job.json"),
      `${JSON.stringify({
        job_version: "1",
        campaign_id: "alpha",
        shard_id: "z-complete",
        state: "complete",
      })}\n`,
    );
    fs.mkdirSync(path.join(beta, "jobs"));
    fs.writeFileSync(path.join(beta, "jobs", "a-unreadable.job.json"), "{not-json\n");
    fs.writeFileSync(
      path.join(beta, "jobs", "z-complete.job.json"),
      `${JSON.stringify({ job_version: "1", role: "check", state: "complete" })}\n`,
    );
    writeResearchCampaign(gamma, ["source-analysis", "synthesis"]);
    fs.mkdirSync(path.join(gamma, "jobs"));
    fs.writeFileSync(
      path.join(gamma, "jobs", "source-analysis.job.json"),
      `${JSON.stringify({
        job_version: "1",
        campaign_id: "alpha",
        shard_id: "source-analysis",
        state: "complete",
      })}\n`,
    );

    const passes = listPasses({ cwd: sandbox, env });
    assert.equal(passes.length, 3);
    assert.deepEqual(
      passes.map((p) => `${p.role}/${p.state}`),
      ["research/failed", "check/unreadable", "research/pending"],
    );

    fs.writeFileSync(
      path.join(gamma, "jobs", "orphan.job.json"),
      `${JSON.stringify({
        job_version: "1",
        campaign_id: "alpha",
        shard_id: "orphan",
        state: "complete",
      })}\n`,
    );
    assert.equal(
      listPasses({ cwd: sandbox, env }).find((pass) => pass.pass.includes("gamma")).state,
      "unreadable",
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

test("inspects a retained schema-v1 pass for closure without its old registry", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-test-"));
  try {
    const { passDirectory } = makeLegacyPass(sandbox);
    const before = fs.readFileSync(path.join(passDirectory, "pass-context.json"), "utf8");
    assert.deepEqual(inspectLegacyPass({ passDirectory }), {
      kind: "legacy-v1-closure",
      schema_version: 1,
      workflow: "second-opinion-review",
      role: "check",
      pass: path.basename(passDirectory),
      path: passDirectory,
      relocated: false,
      state: "complete",
      resumable: false,
    });

    const cli = spawnSync(
      process.execPath,
      [scriptPath, "inspect-legacy-pass", passDirectory],
      { cwd: sandbox, env: isolatedEnv(), encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), inspectLegacyPass({ passDirectory }));
    assert.equal(
      fs.readFileSync(path.join(passDirectory, "pass-context.json"), "utf8"),
      before,
    );
    assert.throws(
      () => verifyPassDirectory({ passDirectory, expectedRole: "check" }),
      /pass context has invalid keys/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("keeps schema-v1 inspection separate from current passes and rejects tampering", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-test-"));
  try {
    const { passDirectory, context } = makeLegacyPass(sandbox);
    const current = prepareArtifactDirectory({
      slug: "current-only",
      role: "check",
      cwd: sandbox,
      env: isolatedEnv({ SECOND_OPINION_WORKING_RUNS: path.join(sandbox, "current-runs") }),
    });
    assert.throws(
      () => inspectLegacyPass({ passDirectory: current }),
      /legacy pass context has invalid keys/,
    );

    fs.writeFileSync(
      path.join(passDirectory, "pass-context.json"),
      `${JSON.stringify({
        ...context,
        resolution: { ...context.resolution, artifact_repository_root: "/etc" },
      }, null, 2)}\n`,
    );
    assert.throws(
      () => inspectLegacyPass({ passDirectory }),
      /legacy explicit pass context is inconsistent/,
    );

    fs.writeFileSync(
      path.join(passDirectory, "pass-context.json"),
      `${JSON.stringify({ ...context, unsupported: true }, null, 2)}\n`,
    );
    assert.throws(
      () => inspectLegacyPass({ passDirectory }),
      /unsupported unsupported/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects a non-relocated explicit legacy pass with a false artifact owner", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-owner-"));
  const repository = path.join(sandbox, "repository");
  try {
    fs.mkdirSync(repository);
    run("git", ["init", "-q"], repository);
    const { passDirectory, context } = makeLegacyPass(repository);
    fs.writeFileSync(
      path.join(passDirectory, "pass-context.json"),
      `${JSON.stringify({
        ...context,
        resolution: {
          ...context.resolution,
          artifact_repository_root: sandbox,
        },
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    assert.throws(
      () => inspectLegacyPass({ passDirectory }),
      /legacy artifact repository identity changed/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("accepts a valid legacy configured root that resolved through an internal symlink", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-test-"));
  try {
    run("git", ["init", "-q"], sandbox);
    run("git", ["config", "user.name", "legacy-linked"], sandbox);
    run("git", ["config", "user.email", "legacy-linked@example.invalid"], sandbox);
    fs.writeFileSync(path.join(sandbox, ".gitignore"), "private-runs/\nlinked-runs\n");
    run("git", ["add", ".gitignore"], sandbox);
    run("git", ["commit", "-qm", "legacy owner"], sandbox);
    const passDirectory = makeLegacyConfiguredPass(sandbox);
    const inspected = inspectLegacyPass({ passDirectory });
    assert.equal(inspected.kind, "legacy-v1-closure");
    assert.equal(inspected.role, "check");
    assert.equal(inspected.relocated, false);
    assert.equal(inspected.state, "unknown");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("inspects a legacy configured pass after the whole owning checkout moves", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-move-"));
  const original = path.join(sandbox, "original");
  const moved = path.join(sandbox, "moved");
  try {
    fs.mkdirSync(original);
    run("git", ["init", "-q"], original);
    run("git", ["config", "user.name", "legacy-move"], original);
    run("git", ["config", "user.email", "legacy-move@example.invalid"], original);
    fs.writeFileSync(path.join(original, ".gitignore"), "private-runs/\nlinked-runs\n");
    run("git", ["add", ".gitignore"], original);
    run("git", ["commit", "-qm", "legacy owner"], original);
    const originalPass = makeLegacyConfiguredPass(original);
    const relativePass = path.relative(original, originalPass);

    fs.renameSync(original, moved);
    const inspected = inspectLegacyPass({
      passDirectory: path.join(moved, relativePass),
    });
    assert.equal(inspected.relocated, true);
    assert.equal(inspected.resumable, false);
    assert.equal(inspected.state, "unknown");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects a relocated legacy repository pass copied outside any repository", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-copy-"));
  const repository = path.join(sandbox, "repository");
  const detached = path.join(sandbox, "detached");
  try {
    fs.mkdirSync(repository);
    fs.mkdirSync(detached);
    run("git", ["init", "-q"], repository);
    run("git", ["config", "user.name", "legacy-copy"], repository);
    run("git", ["config", "user.email", "legacy-copy@example.invalid"], repository);
    fs.writeFileSync(path.join(repository, ".gitignore"), "private-runs/\nlinked-runs\n");
    run("git", ["add", ".gitignore"], repository);
    run("git", ["commit", "-qm", "legacy owner"], repository);
    const originalPass = makeLegacyConfiguredPass(repository);
    const relativePass = path.relative(repository, originalPass);

    fs.cpSync(
      path.join(repository, "private-runs"),
      path.join(detached, "private-runs"),
      { recursive: true },
    );
    const detachedPass = path.join(detached, relativePass);
    fs.chmodSync(path.dirname(detachedPass), 0o700);
    fs.chmodSync(detachedPass, 0o700);
    fs.chmodSync(path.join(detachedPass, "pass-context.json"), 0o600);
    assert.throws(
      () => inspectLegacyPass({ passDirectory: detachedPass }),
      /must remain inside an owning repository/,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("reports a symlinked legacy jobs directory as unreadable without following it", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-test-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-legacy-outside-"));
  try {
    const { passDirectory } = makeLegacyPass(sandbox, { state: null });
    fs.writeFileSync(
      path.join(outside, "checker.job.json"),
      `${JSON.stringify({
        job_version: "1",
        role: "checker",
        state: "complete",
      })}\n`,
    );
    fs.symlinkSync(outside, path.join(passDirectory, "jobs"), "dir");
    assert.equal(inspectLegacyPass({ passDirectory }).state, "unreadable");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
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
