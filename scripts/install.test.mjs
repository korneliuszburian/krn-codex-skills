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

test("refuses an unowned skill destination collision without touching it", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-test-"));
  try {
    const env = sandboxEnv(sandbox);
    fs.mkdirSync(env.KRN_SKILLS_DEST, { recursive: true });
    const implement = path.join(env.KRN_SKILLS_DEST, "implement");
    fs.writeFileSync(implement, "operator-owned, do not touch");
    const result = spawnSync("bash", [installScript, "install"], { encoding: "utf8", env });
    assert.equal(result.status, 73, result.stderr);
    assert.equal(
      fs.readFileSync(implement, "utf8"),
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
    const legacy = path.join(env.CODEX_HOME, "skills", "code-review");
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
