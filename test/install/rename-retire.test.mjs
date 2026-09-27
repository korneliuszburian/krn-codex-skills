import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));

function seedSourceCheckout(destination) {
  const listed = execFileSync(
    "git",
    ["-C", sourceRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { maxBuffer: 64 * 1024 * 1024 },
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const relative of listed) {
    const from = path.join(sourceRoot, relative);
    const to = path.join(destination, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(from), to);
      continue;
    }
    fs.copyFileSync(from, to);
    fs.chmodSync(to, stat.mode);
  }
  execFileSync("git", ["-C", destination, "init", "-q"]);
  execFileSync("git", ["-C", destination, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", destination, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(destination);
}

function withInstallEnvironment(body) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-rename-retire-"));
  const previous = {
    skills: process.env.KRN_SKILLS_DEST,
    bins: process.env.KRN_BIN_DEST,
    opencode: process.env.KRN_OPENCODE_DEST,
  };
  process.env.KRN_SKILLS_DEST = path.join(base, "skills");
  process.env.KRN_BIN_DEST = path.join(base, "bin");
  process.env.KRN_OPENCODE_DEST = path.join(base, "opencode");
  try {
    return body(base);
  } finally {
    if (previous.skills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previous.skills;
    if (previous.bins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previous.bins;
    if (previous.opencode === undefined) delete process.env.KRN_OPENCODE_DEST;
    else process.env.KRN_OPENCODE_DEST = previous.opencode;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
}

test("a real install retires a prior release's managed krn-codex link with a backup", async () => {
  const { applyInstall, createInstallPlan } = await import("../../scripts/lib/install/install-release.mjs");
  withInstallEnvironment((base) => {
    const home = path.join(base, "codex");
    const source = seedSourceCheckout(path.join(base, "source"));
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan);

    const current = fs.realpathSync(plan.current);
    const krnLink = path.join(base, "bin", "krn");
    const codexLink = path.join(base, "bin", "krn-codex");
    assert.ok(fs.lstatSync(krnLink).isSymbolicLink(), "the neutral entry is installed");
    assert.equal(fs.realpathSync(krnLink), path.join(current, "scripts", "krn.mjs"));
    assert.equal(fs.existsSync(codexLink), false, "a fresh install must not create the retired alias link");
    const catalogLink = path.join(base, "bin", "krn-codex-catalog");
    const catalog = spawnSync(process.execPath, [catalogLink, "profile", "list", "--json"], { encoding: "utf8" });
    assert.equal(catalog.status, 0, catalog.stderr);
    assert.ok(JSON.parse(catalog.stdout).some((profile) => profile.name === "minimal"));

    // The prior release installed this managed link; the retired manifest no
    // longer declares it, so the next apply must retire it with a backup.
    fs.symlinkSync(path.join(plan.current, "scripts", "krn-codex.mjs"), codexLink);
    const applied = applyInstall(plan);
    assert.equal(fs.existsSync(codexLink), false, "orphan cleanup must remove the stale link");
    assert.ok(applied.backup, "the retirement must preserve the link under migration-backups");
    const backup = fs.readdirSync(applied.backup).find((name) => name.endsWith("krn-codex"));
    assert.ok(backup, `the backup must keep the stale link: ${fs.readdirSync(applied.backup)}`);
    assert.equal(
      fs.readlinkSync(path.join(applied.backup, backup)),
      path.join(plan.current, "scripts", "krn-codex.mjs"),
    );
  });
});

test("a renamed capsule hook backs up the previous managed hook link", async () => {
  const { applyInstall, createInstallPlan } = await import("../../scripts/lib/install/install-release.mjs");
  withInstallEnvironment((base) => {
    const home = path.join(base, "codex");
    const previous = seedSourceCheckout(path.join(base, "previous"));
    const renamed = path.join(previous, "scripts", "hooks", "krn_capsule.py");
    if (fs.existsSync(renamed)) {
      fs.renameSync(renamed, path.join(previous, "scripts", "hooks", "krn_memory.py"));
      for (const relative of ["config/hooks.json", "skills/manifest.json"]) {
        const file = path.join(previous, relative);
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("krn_capsule.py", "krn_memory.py"));
      }
      execFileSync("git", ["-C", previous, "add", "-A"]);
      execFileSync("git", ["-C", previous, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "previous hook name"]);
    } else {
      assert.ok(fs.existsSync(path.join(previous, "scripts", "hooks", "krn_memory.py")), "the base must contain the prior hook");
    }
    const oldPlan = createInstallPlan({ source: previous, cwd: previous, codexHome: home });
    applyInstall(oldPlan);
    const old = path.join(home, "hooks", "krn_memory.py");
    assert.equal(fs.realpathSync(old), path.join(fs.realpathSync(oldPlan.current), "scripts", "hooks", "krn_memory.py"));

    const source = seedSourceCheckout(path.join(base, "source"));
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    const applied = applyInstall(plan);
    const capsule = path.join(home, "hooks", "krn_capsule.py");
    assert.equal(fs.realpathSync(capsule), path.join(fs.realpathSync(plan.current), "scripts", "hooks", "krn_capsule.py"));
    assert.equal(fs.lstatSync(old, { throwIfNoEntry: false }), undefined, "the prior hook link is retired");
    assert.ok(applied.backup, "the previous KRN hook link has a rollback backup");
    const backup = fs.readdirSync(applied.backup).find((entry) => entry.endsWith("krn_memory.py"));
    assert.ok(backup, `the old hook link must be backed up: ${fs.readdirSync(applied.backup)}`);
    assert.equal(fs.readlinkSync(path.join(applied.backup, backup)), path.join(plan.current, "scripts", "hooks", "krn_memory.py"));
  });
});
