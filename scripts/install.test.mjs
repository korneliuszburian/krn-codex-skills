import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installScript = path.join(REPO, "scripts", "install.sh");

function sandboxEnv(sandbox) {
  return {
    ...process.env,
    KRN_SKILLS_DEST: path.join(sandbox, "skills"),
    KRN_BIN_DEST: path.join(sandbox, "bin"),
    CODEX_HOME: path.join(sandbox, "codex"),
    CLAUDE_CONFIG_DIR: path.join(sandbox, "claude"),
  };
}

function manifestSkills() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO, "skills", "manifest.json"), "utf8"),
  );
  return manifest.skills;
}

function upstreamRetiredSkills() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO, "skills", "manifest.json"), "utf8"),
  );
  return manifest.retired_skills.filter((skill) => skill.owner?.startsWith("upstream:"));
}

test("refuses an unowned skill destination collision without touching it", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    fs.mkdirSync(env.KRN_SKILLS_DEST, { recursive: true });
    const collision = path.join(env.KRN_SKILLS_DEST, "delivery-loop");
    fs.writeFileSync(collision, "operator-owned, do not touch");
    const result = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(result.status, 73, result.stderr);
    assert.equal(
      fs.readFileSync(collision, "utf8"),
      "operator-owned, do not touch",
      "the foreign file must be left byte-identical",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("installs every manifest skill as a collision-safe symlink into the repo", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    const result = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    for (const skill of manifestSkills()) {
      const link = path.join(env.KRN_SKILLS_DEST, skill.name);
      const stat = fs.lstatSync(link);
      assert.ok(stat.isSymbolicLink(), `${skill.name} is not a symlink`);
      assert.equal(
        fs.realpathSync(link),
        fs.realpathSync(path.join(REPO, skill.path)),
        `${skill.name} does not resolve to the repo source`,
      );
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses a masked global AGENTS.override.md before linking anything", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    fs.mkdirSync(env.CODEX_HOME, { recursive: true });
    fs.writeFileSync(path.join(env.CODEX_HOME, "AGENTS.override.md"), "operator override");
    const result = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(result.status, 75, result.stderr);
    assert.ok(
      !fs.existsSync(env.KRN_SKILLS_DEST) ||
        fs.readdirSync(env.KRN_SKILLS_DEST).length === 0,
      "no skill may be linked when the override mask refuses the install",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("archives a displaced legacy path into a backup instead of deleting it", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = { ...sandboxEnv(sandbox), KRN_ARCHIVE_LEGACY: "1" };
    const legacy = path.join(env.CODEX_HOME, "skills", "claude-second-opinion-review");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "legacy operator content");
    const result = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(legacy), "legacy file must be moved out of its old path");
    const backups = path.join(env.CODEX_HOME, "skill-migration-backups");
    const found = execFileSync(
      "grep",
      ["-rl", "legacy operator content", backups],
      { encoding: "utf8" },
    ).trim();
    assert.ok(found.length > 0, "legacy content must be preserved in the backup tree");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("reports and explicitly archives a retired installed skill, including a stale symlink", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    fs.mkdirSync(env.KRN_SKILLS_DEST, { recursive: true });
    const retired = path.join(env.KRN_SKILLS_DEST, "second-opinion-review");
    const oldSource = path.join(sandbox, "deleted-second-opinion-review-source");
    fs.symlinkSync(oldSource, retired);

    const check = spawnSync("bash", [installScript, "check"], {
      encoding: "utf8",
      env,
    });
    assert.equal(check.status, 1, check.stderr);
    assert.match(check.stdout, /retired .*second-opinion-review/);
    assert.ok(fs.lstatSync(retired).isSymbolicLink());

    const refused = spawnSync("bash", [installScript, "install"], {
      encoding: "utf8",
      env,
    });
    assert.equal(refused.status, 81, refused.stderr);
    assert.ok(fs.lstatSync(retired).isSymbolicLink());

    const installed = spawnSync("bash", [installScript, "install"], {
      encoding: "utf8",
      env: { ...env, KRN_ARCHIVE_LEGACY: "1" },
    });
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(
      fs.lstatSync(retired, { throwIfNoEntry: false }),
      undefined,
      "the retired path must no longer expose a stale symlink",
    );

    const backupRoot = path.join(env.CODEX_HOME, "skill-migration-backups");
    const backup = fs.readdirSync(backupRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory());
    assert.ok(backup, "retired skill archive must create a backup directory");
    const archived = path.join(
      backupRoot,
      backup.name,
      "retired-skill__second-opinion-review",
    );
    assert.ok(fs.lstatSync(archived).isSymbolicLink());
    assert.equal(fs.readlinkSync(archived), oldSource);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("archives every retired upstream skill left by an older install", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    fs.mkdirSync(env.KRN_SKILLS_DEST, { recursive: true });
    const retired = upstreamRetiredSkills();
    for (const skill of retired) {
      fs.symlinkSync(
        path.join(sandbox, `${skill.name}-old-source`),
        path.join(env.KRN_SKILLS_DEST, skill.name),
      );
    }

    const check = spawnSync("bash", [installScript, "check"], { encoding: "utf8", env });
    assert.equal(check.status, 1, check.stderr);
    for (const skill of retired) assert.match(check.stdout, new RegExp(`retired .*${skill.name}`));

    const refused = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(refused.status, 81, refused.stderr);

    const installed = spawnSync("bash", [installScript, "install"], {
      encoding: "utf8",
      env: { ...env, KRN_ARCHIVE_LEGACY: "1" },
    });
    assert.equal(installed.status, 0, installed.stderr);
    const backupRoot = path.join(env.CODEX_HOME, "skill-migration-backups");
    const backup = fs.readdirSync(backupRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory());
    assert.ok(backup, "retired upstream paths must be archived");
    for (const skill of retired) {
      assert.equal(
        fs.lstatSync(path.join(env.KRN_SKILLS_DEST, skill.name), { throwIfNoEntry: false }),
        undefined,
      );
      assert.ok(
        fs.lstatSync(path.join(backupRoot, backup.name, `retired-skill__${skill.name}`)),
      );
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
