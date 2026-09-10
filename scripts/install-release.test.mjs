import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "scripts", "krn-codex.mjs");

function sourceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-release-test-"));
  const source = path.join(root, "source");
  fs.cpSync(REPO, source, {
    recursive: true,
    filter(candidate) {
      const name = path.basename(candidate);
      return ![".git", ".krn", "node_modules"].includes(name);
    },
  });
  execFileSync("git", ["init", "--quiet", source]);
  execFileSync("git", ["-C", source, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", source, "config", "user.name", "KRN release test"]);
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", ["-C", source, "commit", "--quiet", "-m", "source fixture"]);
  return { root, source };
}

function environment(root, extra = {}) {
  return {
    ...process.env,
    CODEX_HOME: path.join(root, "codex"),
    KRN_SKILLS_DEST: path.join(root, "skills"),
    KRN_BIN_DEST: path.join(root, "bin"),
    ...extra,
  };
}

function invoke(root, args, extra = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    env: environment(root, extra),
    encoding: "utf8",
  });
}

function commit(source, message) {
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", ["-C", source, "commit", "--quiet", "-m", message]);
  return execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function apply(root, source, extra = {}) {
  const result = invoke(root, ["install", "apply", "--source", source, "--yes", "--json"], extra);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("plan is read-only and rejects a dirty source checkout", () => {
  const { root, source } = sourceFixture();
  try {
    const before = fs.readdirSync(root).sort();
    const plan = invoke(root, ["install", "plan", "--source", source, "--json"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.deepEqual(fs.readdirSync(root).sort(), before, "plan must not materialize a destination");
    fs.appendFileSync(path.join(source, "README.md"), "\nfixture mutation\n");
    const dirty = invoke(root, ["install", "plan", "--source", source]);
    assert.equal(dirty.status, 65);
    assert.match(dirty.stderr, /source checkout is dirty/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("apply materializes an exact immutable release and stable links through current", () => {
  const { root, source } = sourceFixture();
  try {
    const applied = apply(root, source);
    const manifest = JSON.parse(fs.readFileSync(path.join(source, "skills", "manifest.json"), "utf8"));
    const release = path.join(root, "codex", "krn", "releases", applied.commit);
    assert.equal(applied.release, release);
    assert.equal(fs.realpathSync(path.join(root, "codex", "krn", "current")), release);
    assert.equal(JSON.parse(fs.readFileSync(path.join(release, ".krn-release.json"), "utf8")).commit, applied.commit);
    for (const skill of manifest.skills) {
      const target = path.join(root, "skills", skill.name);
      assert.equal(fs.realpathSync(target), path.join(release, skill.path));
      assert.match(fs.readlinkSync(target), /[\\/]krn[\\/]current[\\/]/);
    }
    for (const sourceOnly of manifest.source_only_skills) {
      assert.equal(fs.existsSync(path.join(root, "skills", sourceOnly.name)), false);
      assert.equal(fs.existsSync(path.join(release, sourceOnly.path)), false);
    }
    assert.equal(
      fs.realpathSync(path.join(root, "bin", "krn-codex")),
      path.join(release, "scripts", "krn-codex.mjs"),
    );
    assert.equal(
      fs.realpathSync(path.join(root, "codex", "AGENTS.md")),
      path.join(release, manifest.global_agents),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an existing matching release is idempotent and corruption fails closed", () => {
  const { root, source } = sourceFixture();
  try {
    const first = apply(root, source);
    const second = apply(root, source);
    assert.equal(second.idempotent, true);
    const releaseSkill = path.join(first.release, "skills", "engineering", "delivery-loop", "SKILL.md");
    fs.appendFileSync(releaseSkill, "\ncorruption\n");
    const corrupt = invoke(root, ["install", "apply", "--source", source, "--yes"]);
    assert.equal(corrupt.status, 66);
    assert.match(corrupt.stderr, /existing release is corrupt/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkout mutation cannot alter installed bytes and an interrupted switch rolls current back", () => {
  const { root, source } = sourceFixture();
  try {
    const first = apply(root, source);
    const installedOpinion = path.join(first.release, "skills", "advisory", "opencode-second-opinion", "SKILL.md");
    const installedBytes = fs.readFileSync(installedOpinion, "utf8");
    fs.appendFileSync(path.join(source, "skills", "advisory", "opencode-second-opinion", "SKILL.md"), "\nsource B mutation\n");
    const secondCommit = commit(source, "source B");
    assert.equal(fs.readFileSync(installedOpinion, "utf8"), installedBytes);
    const failed = invoke(root, ["install", "apply", "--source", source, "--yes"], { KRN_TEST_FAIL_AFTER_CURRENT: "1" });
    assert.notEqual(failed.status, 0);
    assert.equal(fs.realpathSync(path.join(root, "codex", "krn", "current")), first.release);
    assert.ok(fs.existsSync(path.join(root, "codex", "krn", "releases", secondCommit)));
    const doctor = invoke(root, ["doctor", "--json"]);
    assert.equal(doctor.status, 0, doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.filesystem.status, "filesystem_installed");
    assert.equal(report.session.status, "session_loaded_unknown");
    assert.equal(report.sessionAfterApply.status, "stale_session_likely");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("foreign destinations are never replaced", () => {
  const { root, source } = sourceFixture();
  try {
    const target = path.join(root, "skills", "delivery-loop");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "operator-owned");
    const result = invoke(root, ["install", "apply", "--source", source, "--yes"]);
    assert.equal(result.status, 73);
    assert.equal(fs.readFileSync(target, "utf8"), "operator-owned");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repo apply owns AGENTS.md only and preserves a foreign CLAUDE.md file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-repo-cli-test-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    const foreign = path.join(root, "CLAUDE.md");
    fs.writeFileSync(foreign, "# Foreign harness contract\n");
    const result = invoke(root, [
      "repo", "apply", "--root", root,
      "--tracker", "none", "--domain", "single", "--delivery", "local",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(root, "AGENTS.md")));
    assert.equal(fs.readFileSync(foreign, "utf8"), "# Foreign harness contract\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("capability is routed through the public CLI", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-capability-cli-test-"));
  try {
    const result = invoke(root, ["capability", "profile", "show", "lean", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).name, "lean");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
