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

test("the install shim dispatches check and rejects an unknown mode", () => {
  const shim = path.join(sourceRoot, "scripts", "install.sh");
  const bad = spawnSync("bash", [shim, "bogus"], { encoding: "utf8" });
  assert.equal(bad.status, 64);
  assert.match(bad.stderr, /usage: install\.sh/);
  const check = spawnSync("bash", [shim, "check"], { encoding: "utf8" });
  const direct = spawnSync(process.execPath, [path.join(sourceRoot, "scripts", "krn-codex.mjs"), "install", "check"], { encoding: "utf8" });
  assert.match(check.stdout, /"releaseRoot"/, `the shim must reach the install CLI: ${check.stderr}`);
  assert.equal(check.status, direct.status, "the shim forwards the CLI exit status");
  assert.equal(check.stdout, direct.stdout, "the shim forwards the CLI output");
});

test("apply fails closed and restores current when the installed CLI cannot start", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-smoke-"));
  const copy = path.join(base, "source");
  fs.mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  fs.appendFileSync(path.join(copy, "scripts", "lib", "support", "diagnostics.mjs"), '\nthrow new Error("krn smoke failure");\n');
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "break the installed CLI start"]);

  const home = path.join(base, "codex");
  const previousSkills = process.env.KRN_SKILLS_DEST;
  const previousBins = process.env.KRN_BIN_DEST;
  const previousOpencode = process.env.KRN_OPENCODE_DEST;
  process.env.KRN_SKILLS_DEST = path.join(base, "skills");
  process.env.KRN_BIN_DEST = path.join(base, "bin");
  process.env.KRN_OPENCODE_DEST = path.join(base, "opencode");
  try {
    const plan = createInstallPlan({ source: copy, cwd: copy, codexHome: home });
    assert.ok(plan.runtimePaths.includes("scripts/lib/support/diagnostics.mjs"));
    assert.throws(
      () => applyInstall(plan),
      (error) => error.exitCode === EXIT_CODES.CORRUPT && /smoke failed/.test(error.message),
    );
    assert.equal(fs.lstatSync(plan.current, { throwIfNoEntry: false }), undefined);
    assert.ok(fs.existsSync(plan.release));
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
    if (previousOpencode === undefined) delete process.env.KRN_OPENCODE_DEST;
    else process.env.KRN_OPENCODE_DEST = previousOpencode;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
});

test("apply fails closed when the installed CLI hangs", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-hang-"));
  const copy = path.join(base, "source");
  fs.mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  const entry = path.join(copy, "scripts", "krn-codex.mjs");
  const original = fs.readFileSync(entry, "utf8");
  const lines = original.split("\n");
  let lastImport = -1;
  lines.forEach((line, index) => {
    if (/^import\s/.test(line)) lastImport = index;
  });
  lines.splice(lastImport + 1, 0, "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);");
  fs.writeFileSync(entry, lines.join("\n"));
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "hang the installed CLI"]);

  const home = path.join(base, "codex");
  const previousSkills = process.env.KRN_SKILLS_DEST;
  const previousBins = process.env.KRN_BIN_DEST;
  const previousOpencode = process.env.KRN_OPENCODE_DEST;
  const previousTimeout = process.env.KRN_SMOKE_TIMEOUT_MS;
  process.env.KRN_SKILLS_DEST = path.join(base, "skills");
  process.env.KRN_BIN_DEST = path.join(base, "bin");
  process.env.KRN_OPENCODE_DEST = path.join(base, "opencode");
  process.env.KRN_SMOKE_TIMEOUT_MS = "2000";
  try {
    const plan = createInstallPlan({ source: copy, cwd: copy, codexHome: home });
    const started = Date.now();
    assert.throws(
      () => applyInstall(plan),
      (error) => error.exitCode === EXIT_CODES.CORRUPT && /timed out after 2000ms/.test(error.message),
    );
    assert.ok(Date.now() - started < 20000, "the hung smoke must fail within the bound");
    assert.equal(fs.lstatSync(plan.current, { throwIfNoEntry: false }), undefined);
  } finally {
    if (previousSkills === undefined) delete process.env.KRN_SKILLS_DEST;
    else process.env.KRN_SKILLS_DEST = previousSkills;
    if (previousBins === undefined) delete process.env.KRN_BIN_DEST;
    else process.env.KRN_BIN_DEST = previousBins;
    if (previousOpencode === undefined) delete process.env.KRN_OPENCODE_DEST;
    else process.env.KRN_OPENCODE_DEST = previousOpencode;
    if (previousTimeout === undefined) delete process.env.KRN_SMOKE_TIMEOUT_MS;
    else process.env.KRN_SMOKE_TIMEOUT_MS = previousTimeout;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
});

test("the CLI rejects a duplicate single-valued option", () => {
  const cli = path.join(sourceRoot, "scripts", "krn-codex.mjs");
  const duplicate = spawnSync(process.execPath, [cli, "install", "plan", "--source", sourceRoot, "--source", sourceRoot], { encoding: "utf8" });
  assert.equal(duplicate.status, EXIT_CODES.USAGE);
  assert.match(duplicate.stderr, /duplicate option: --source/);
});

test("an unconfirmed install apply does not run the source validator", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-install-confirm-"));
  const copy = path.join(base, "source");
  fs.mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  fs.writeFileSync(path.join(copy, "scripts", "validate.mjs"), 'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.KRN_MARKER, "ran");\n');
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "add", "-A"]);
  execFileSync("git", ["-C", copy, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "marker validator"]);
  const marker = path.join(base, "marker");
  const result = spawnSync(process.execPath, [path.join(sourceRoot, "scripts", "krn-codex.mjs"), "install", "apply", "--source", copy], { encoding: "utf8", env: { ...process.env, KRN_MARKER: marker } });
  assert.equal(result.status, EXIT_CODES.USAGE);
  assert.match(result.stderr, /requires --yes/);
  assert.equal(fs.existsSync(marker), false, "the source validator must not run before confirmation");
  fs.rmSync(base, { recursive: true, force: true });
});
