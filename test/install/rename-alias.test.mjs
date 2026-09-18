import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applyInstall, createInstallPlan } from "../../scripts/lib/install/install-release.mjs";
import { EXIT_CODES } from "../../scripts/lib/support/diagnostics.mjs";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const USAGE = EXIT_CODES.USAGE;

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

test("the neutral entry point exists and the krn-codex alias is retired", () => {
  assert.ok(fs.existsSync(path.join(sourceRoot, "scripts", "krn.mjs")), "scripts/krn.mjs must exist");
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "skills", "manifest.json"), "utf8"));
  assert.equal(manifest.bins[0].name, "krn", JSON.stringify(manifest.bins));
  assert.equal(manifest.bins[0].path, "scripts/krn.mjs");
  assert.ok(
    !manifest.bins.some((bin) => bin.name === "krn-codex"),
    "the retired krn-codex alias must leave the manifest bins",
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.bin), ["krn", "krn-codex-catalog"]);
  assert.equal(pkg.bin.krn, "scripts/krn.mjs");
  assert.equal(pkg.bin["krn-codex"], undefined);
  assert.ok(
    fs.existsSync(path.join(sourceRoot, "scripts", "krn-codex.mjs")),
    "the frozen compatibility shim file must stay in the checkout",
  );
});

test("a real install links only the neutral entry and retires the alias", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-rename-alias-"));
  const previous = {
    skills: process.env.KRN_SKILLS_DEST,
    bins: process.env.KRN_BIN_DEST,
    opencode: process.env.KRN_OPENCODE_DEST,
  };
  process.env.KRN_SKILLS_DEST = path.join(base, "skills");
  process.env.KRN_BIN_DEST = path.join(base, "bin");
  process.env.KRN_OPENCODE_DEST = path.join(base, "opencode");
  try {
    const home = path.join(base, "codex");
    const source = seedSourceCheckout(path.join(base, "source"));
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(plan);

    const current = fs.realpathSync(plan.current);
    const krnLink = path.join(base, "bin", "krn");
    const codexLink = path.join(base, "bin", "krn-codex");
    assert.ok(fs.lstatSync(krnLink).isSymbolicLink(), "krn must be a managed bin link");
    assert.equal(fs.realpathSync(krnLink), path.join(current, "scripts", "krn.mjs"));
    assert.equal(fs.existsSync(codexLink), false, "the retired krn-codex link must not be installed");

    const help = spawnSync(process.execPath, [krnLink, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, `${help.stdout}${help.stderr}`);
    assert.match(help.stdout, /Usage:/);

    const bare = spawnSync(process.execPath, [krnLink], { encoding: "utf8" });
    assert.equal(bare.status, USAGE, `${bare.stdout}${bare.stderr}`);

    const shimHelp = spawnSync(process.execPath, [path.join(sourceRoot, "scripts", "krn-codex.mjs"), "--help"], { encoding: "utf8" });
    assert.equal(shimHelp.status, 0, `${shimHelp.stdout}${shimHelp.stderr}`);
  } finally {
    if (previous.skills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previous.skills;
    if (previous.bins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previous.bins;
    if (previous.opencode === undefined) delete process.env.KRN_OPENCODE_DEST;
    else process.env.KRN_OPENCODE_DEST = previous.opencode;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
});
