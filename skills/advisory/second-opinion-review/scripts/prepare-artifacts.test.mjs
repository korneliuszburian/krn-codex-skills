import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  defaultRoot,
  listPasses,
  prepareArtifactDirectory,
  resolveArtifactRoot,
} from "./prepare-artifacts.mjs";

const scriptPath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));
const skillRoot = path.dirname(path.dirname(scriptPath));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("the fallback artifact root is fixed in the skill, not derived from env", () => {
  assert.equal(
    defaultRoot,
    path.join(os.homedir(), "coding", "krn", "second-opinion-review"),
  );
});

test("resolves configured working runs inside the current repository", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-resolver-test-"));
  try {
    run("git", ["init", "-q"], sandbox);
    fs.mkdirSync(path.join(sandbox, "docs", "agents"), { recursive: true });
    fs.writeFileSync(
      path.join(sandbox, "docs", "agents", "artifact-paths.json"),
      `${JSON.stringify({ schema_version: 1, working_runs: "docs/agents/runs" })}\n`,
    );

    const expected = path.join(sandbox, "docs", "agents", "runs", "second-opinion-review");
    assert.equal(resolveArtifactRoot({ cwd: sandbox }), expected);
    const pass = prepareArtifactDirectory({ slug: "configured", cwd: sandbox });
    assert.equal(path.dirname(pass), expected);
    assert.match(path.basename(pass), /^\d{4}-\d{2}-\d{2}-passes-configured-/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("falls back outside repositories and rejects unsafe configured roots", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-resolver-reject-test-"));
  try {
    assert.equal(resolveArtifactRoot({ cwd: sandbox }), defaultRoot);
    run("git", ["init", "-q"], sandbox);
    fs.mkdirSync(path.join(sandbox, "docs", "agents"), { recursive: true });
    const configPath = path.join(sandbox, "docs", "agents", "artifact-paths.json");
    fs.writeFileSync(configPath, `${JSON.stringify({ schema_version: 1, working_runs: "../escape" })}\n`);
    assert.throws(() => resolveArtifactRoot({ cwd: sandbox }), /inside the repository/);
    fs.writeFileSync(configPath, `${JSON.stringify({ schema_version: 1, working_runs: "/tmp/escape" })}\n`);
    assert.throws(() => resolveArtifactRoot({ cwd: sandbox }), /repository-relative/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects a configured working root that crosses a repository symlink", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-resolver-symlink-test-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-resolver-outside-"));
  try {
    run("git", ["init", "-q"], sandbox);
    fs.mkdirSync(path.join(sandbox, "docs", "agents"), { recursive: true });
    fs.symlinkSync(outside, path.join(sandbox, "escaped"));
    fs.writeFileSync(
      path.join(sandbox, "docs", "agents", "artifact-paths.json"),
      `${JSON.stringify({ schema_version: 1, working_runs: "escaped/runs" })}\n`,
    );
    assert.throws(() => resolveArtifactRoot({ cwd: sandbox }), /inside the repository/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("creates one unique private pass directory below the given root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-artifacts-test-"));
  const root = path.join(sandbox, "owned-root");
  try {
    const first = prepareArtifactDirectory({ slug: "matt-skills-audit", project: "ns", root });
    const second = prepareArtifactDirectory({ slug: "matt-skills-audit", project: "ns", root });

    assert.equal(path.dirname(first), path.join(root, "ns", "passes"));
    assert.equal(path.dirname(path.dirname(first)), path.join(root, "ns"));
    assert.equal(path.dirname(path.dirname(path.dirname(first))), root);
    assert.notEqual(first, second);
    assert.match(path.basename(first), /^\d{4}-\d{2}-\d{2}-matt-skills-audit-/);
    assert.equal(fs.statSync(first).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(root, "ns")).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
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

    const repoPass = prepareArtifactDirectory({ slug: "shard", cwd: repo, root });
    assert.equal(
      path.basename(path.dirname(path.dirname(repoPass))),
      "my-awesome-project",
      "uppercase and underscores are sanitized to kebab from the repo basename",
    );

    const adhocPass = prepareArtifactDirectory({ slug: "shard", cwd: sandbox, root });
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
    const researchPass = prepareArtifactDirectory({
      slug: "shard",
      category: "research",
      project: "proj-x",
      root,
    });
    const checkPass = prepareArtifactDirectory({
      slug: "claim",
      category: "check",
      project: "proj-x",
      root,
    });
    assert.equal(path.basename(path.dirname(researchPass)), "research");
    assert.equal(path.basename(path.dirname(checkPass)), "check");
    assert.equal(path.dirname(path.dirname(researchPass)), path.join(root, "proj-x"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects bad slug, category, and project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-reject-test-"));
  try {
    assert.throws(
      () => prepareArtifactDirectory({ slug: "Bad Slug", root }),
      /slug must use lowercase/,
    );
    assert.throws(
      () => prepareArtifactDirectory({ slug: "ok", category: "Bad Category", root }),
      /category must use lowercase/,
    );
    assert.throws(
      () => prepareArtifactDirectory({ slug: "ok", project: "!!!", root }),
      /project must sanitize/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("list enumerates passes grouped by project and category with job state", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-list-test-"));
  const root = path.join(sandbox, "root");
  try {
    const alpha = prepareArtifactDirectory({ slug: "alpha", category: "research", project: "proj-a", root });
    prepareArtifactDirectory({ slug: "beta", category: "check", project: "proj-a", root });
    prepareArtifactDirectory({ slug: "gamma", category: "research", project: "proj-b", root });

    fs.mkdirSync(path.join(alpha, "jobs"));
    fs.writeFileSync(
      path.join(alpha, "jobs", "alpha.job.json"),
      `${JSON.stringify({ state: "complete" })}\n`,
    );

    const passes = listPasses({ root });
    assert.equal(passes.length, 3);
    assert.deepEqual(
      passes.map((p) => `${p.namespace}/${p.category}/${p.state}`),
      ["proj-a/check/unknown", "proj-a/research/complete", "proj-b/research/unknown"],
    );
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
    const pass = mod.prepareArtifactDirectory({
      slug: "installed",
      category: "check",
      project: "symlink-ns",
      root: path.join(sandbox, "root"),
    });
    assert.equal(path.dirname(pass), path.join(sandbox, "root", "symlink-ns", "check"));
    assert.equal(fs.statSync(pass).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the CLI prints usage and exits non-zero with bad arguments", () => {
  const noArgs = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(noArgs.status, 64);
  assert.match(noArgs.stderr, /usage: prepare-artifacts\.mjs/);

  const badSlug = spawnSync(process.execPath, [scriptPath, "Bad Slug"], { encoding: "utf8" });
  assert.equal(badSlug.status, 64);
  assert.match(badSlug.stderr, /slug must use lowercase/);
});
