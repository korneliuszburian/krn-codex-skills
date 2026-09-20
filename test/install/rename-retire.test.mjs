import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("the manifest and package bins retire the krn-codex entry", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "skills", "manifest.json"), "utf8"));
  assert.ok(!manifest.bins.some((bin) => bin.name === "krn-codex"), JSON.stringify(manifest.bins));
  assert.ok(
    !manifest.runtime_paths.includes("scripts/krn-codex.mjs"),
    "the frozen shim must leave the manifest runtime closure",
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.bin), ["krn", "krn-codex-catalog"]);
  assert.ok(
    fs.existsSync(path.join(sourceRoot, "scripts", "krn-codex.mjs")),
    "the frozen shim file must stay in the repository",
  );
});

test("the base-ref conformance invocation applies the frozen case list with the candidate runner", () => {
  const workflow = fs.readFileSync(path.join(sourceRoot, ".github", "workflows", "validate.yml"), "utf8");
  assert.match(workflow, /node scripts\/krn\.mjs conformance check --root \/tmp\/krn-conformance --candidate "\$PWD" --frozen/);
  assert.doesNotMatch(workflow, /\/tmp\/krn-conformance\/scripts\/krn-codex\.mjs/);
  assert.ok(
    fs.existsSync(path.join(sourceRoot, "scripts", "krn-codex.mjs")),
    "the frozen shim file must stay in the repository",
  );
});

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
