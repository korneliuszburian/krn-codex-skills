import assert from "node:assert/strict";
import { git } from "../support/git-fixture.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-compose-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  git(root, ["add", ".krn/runs/.gitignore"]);
  git(root, ["commit", "-q", "-m", "runs boundary"]);
  return root;
}

test("the CLI answers --help with usage on stdout and keeps no-args a usage error", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage:/);
  const none = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(none.status, 64);
});

test("compile, check, and resume compose into one usable restart path", () => {
  const root = makeRepo();
  const compiled = spawnSync(process.execPath, [cli, "state", "compile", root], { encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stderr);
  const dir = join(root, ".krn", "runs", "delivery-loop", "composed");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.md"), compiled.stdout.replace(/<fill:[^>]*>/g, "done"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| Compose the restart path. | composition probe | this test |\n");

  const checked = spawnSync(process.execPath, [cli, "state", "check"], { cwd: root, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);

  const resumed = spawnSync(process.execPath, [cli, "state", "resume"], { cwd: root, encoding: "utf8" });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /capsule composed/);
  assert.match(resumed.stdout, /Compose the restart path\./);
  rmSync(root, { recursive: true, force: true });
});

test("doctor renders a human summary by default and JSON with --json", () => {
  const base = mkdtempSync(join(tmpdir(), "krn-doctor-"));
  const env = { ...process.env, CODEX_HOME: join(base, "codex"), KRN_SKILLS_DEST: join(base, "skills"), KRN_BIN_DEST: join(base, "bin") };
  const text = spawnSync(process.execPath, [cli, "doctor"], { encoding: "utf8", env });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^filesystem: /);
  const json = spawnSync(process.execPath, [cli, "doctor", "--json"], { encoding: "utf8", env });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(typeof JSON.parse(json.stdout).filesystem.status, "string");
  rmSync(base, { recursive: true, force: true });
});
