import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));

function runHelper(args, env, executable = scriptPath, cwd) {
  return execFileSync(process.execPath, [executable, ...args], {
    encoding: "utf8",
    env,
    cwd,
  }).trim();
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("creates one unique private pass directory below the configured root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-artifacts-test-"));
  const root = path.join(sandbox, "owned-root");

  try {
    const configuredEnv = {
      ...process.env,
      SECOND_OPINION_ARTIFACT_ROOT: root,
      SECOND_OPINION_PROJECT: "namespaced",
    };
    const first = runHelper(["matt-skills-audit"], configuredEnv);
    const second = runHelper(["matt-skills-audit"], configuredEnv);

    assert.equal(path.dirname(first), path.join(root, "namespaced", "passes"));
    assert.equal(path.dirname(path.dirname(first)), path.join(root, "namespaced"));
    assert.equal(path.dirname(path.dirname(path.dirname(first))), root);
    assert.notEqual(first, second);
    assert.match(path.basename(first), /^\d{4}-\d{2}-\d{2}-matt-skills-audit-/);
    assert.equal(fs.statSync(first).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(root, "namespaced", "passes")).mode & 0o777, 0o700);

    const stateEnv = {
      ...process.env,
      XDG_STATE_HOME: sandbox,
      SECOND_OPINION_PROJECT: "state-ns",
    };
    delete stateEnv.SECOND_OPINION_ARTIFACT_ROOT;
    const fromStateHome = runHelper(["checker-pass"], stateEnv);
    assert.equal(
      path.dirname(fromStateHome),
      path.join(sandbox, "krn", "second-opinion-review", "state-ns", "passes"),
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
    const passDirectory = runHelper(
      ["installed-path", "check"],
      {
        ...process.env,
        SECOND_OPINION_ARTIFACT_ROOT: root,
        SECOND_OPINION_PROJECT: "installed-ns",
      },
      installedScript,
    );

    assert.equal(path.dirname(passDirectory), path.join(root, "installed-ns", "check"));
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

  const invalidCategory = spawnSync(process.execPath, [scriptPath, "shard", "Bad Category"], {
    encoding: "utf8",
    env: { ...process.env, SECOND_OPINION_ARTIFACT_ROOT: os.tmpdir() },
  });
  assert.equal(invalidCategory.status, 64);
  assert.match(invalidCategory.stderr, /category must use lowercase/);
});

test("namespaces by cwd git repository basename and falls back to adhoc", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-ns-test-"));
  const root = path.join(sandbox, "root");
  const repo = path.join(sandbox, "My_Awesome_Project");
  try {
    fs.mkdirSync(repo);
    run("git", ["init", "-q"], repo);
    run("git", ["config", "user.name", "ns-test"], repo);
    run("git", ["config", "user.email", "ns@example.invalid"], repo);
    run("git", ["commit", "-q", "--allow-empty", "-m", "init"], repo);

    const env = { ...process.env, SECOND_OPINION_ARTIFACT_ROOT: root };
    delete env.SECOND_OPINION_PROJECT;

    const repoPass = runHelper(["shard"], env, scriptPath, repo);
    assert.equal(
      path.basename(path.dirname(path.dirname(repoPass))),
      "my-awesome-project",
      "uppercase and underscores are sanitized to kebab from the repo basename",
    );

    const adhocPass = runHelper(["shard"], env, scriptPath, sandbox);
    assert.equal(
      path.basename(path.dirname(path.dirname(adhocPass))),
      "adhoc",
      "a cwd with no enclosing git repository falls back to the adhoc namespace",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("routes the pass into the explicit category directory", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-category-test-"));
  const root = path.join(sandbox, "root");
  try {
    const env = {
      ...process.env,
      SECOND_OPINION_ARTIFACT_ROOT: root,
      SECOND_OPINION_PROJECT: "proj-x",
    };
    const researchPass = runHelper(["shard", "research"], env);
    const checkPass = runHelper(["claim", "check"], env);

    assert.equal(path.basename(path.dirname(researchPass)), "research");
    assert.equal(path.basename(path.dirname(checkPass)), "check");
    assert.equal(path.dirname(path.dirname(researchPass)), path.join(root, "proj-x"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("list enumerates passes grouped by project and category with job state", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-list-test-"));
  const root = path.join(sandbox, "root");
  try {
    const env = { ...process.env, SECOND_OPINION_ARTIFACT_ROOT: root };
    const alpha = runHelper(["alpha", "research"], { ...env, SECOND_OPINION_PROJECT: "proj-a" });
    runHelper(["beta", "check"], { ...env, SECOND_OPINION_PROJECT: "proj-a" });
    runHelper(["gamma", "research"], { ...env, SECOND_OPINION_PROJECT: "proj-b" });

    fs.mkdirSync(path.join(alpha, "jobs"));
    fs.writeFileSync(
      path.join(alpha, "jobs", "alpha.job.json"),
      `${JSON.stringify({ state: "complete" })}\n`,
    );

    const out = spawnSync(process.execPath, [scriptPath, "list"], {
      encoding: "utf8",
      env,
    });
    assert.equal(out.status, 0, out.stderr);
    const rows = out.stdout.trim().split("\n");
    assert.equal(rows[0], "project\tcategory\tpass\tstate");
    const body = rows.slice(1);
    assert.equal(body.length, 3);
    assert.ok(
      body.some((row) =>
        /^proj-a\tresearch\t\d{4}-\d{2}-\d{2}-alpha-[A-Za-z0-9]{6}\tcomplete$/.test(row),
      ),
      "the alpha research pass records its complete job state",
    );
    assert.ok(body.some((row) => /^proj-a\tcheck\t\d{4}-\d{2}-\d{2}-beta-/.test(row)));
    assert.ok(body.some((row) => /^proj-b\tresearch\t\d{4}-\d{2}-\d{2}-gamma-/.test(row)));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
