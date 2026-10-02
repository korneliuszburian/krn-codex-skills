import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const runners = ["lane-runner.mjs", "trajectory-runner.mjs"];
const AGENT = [
  'import fs from "node:fs";',
  'fs.readFileSync(0, "utf8");',
  'fs.writeFileSync("observed.json", JSON.stringify({ privateRun: fs.existsSync(".krn/runs/private"), git: fs.existsSync(".git"), fixture: fs.readFileSync("fixture.txt", "utf8") }));',
  'process.stdout.write(JSON.stringify({ tokens: 3 }) + "\\n");',
].join("\n");
const CHECK = [
  'import assert from "node:assert/strict";',
  'import { readFileSync } from "node:fs";',
  'assert.deepEqual(JSON.parse(readFileSync("observed.json", "utf8")), { privateRun: false, git: false, fixture: "fixture\\n" });',
].join("\n");

function run(runner, dir, extraEnv = {}) {
  const task = runner === "lane-runner.mjs"
    ? { id: "copy", workspace: "workspace", hidden: ["check.mjs"], check: "node check.mjs" }
    : { id: "copy", workspace: "workspace", hidden: ["check.mjs"], steps: [{ id: "write", check: "node check.mjs" }] };
  return spawnSync(process.execPath, [path.join(root, "scripts/harness", runner)], {
    input: JSON.stringify({ task, root: dir }), encoding: "utf8", cwd: dir,
    env: { ...process.env, KRN_HARNESS_AGENT: `node ${path.join(dir, "agent.mjs")}`, ...extraEnv },
  });
}

for (const runner of runners) {
  test(`${runner} delegates a fixture without exposing private runs or linked Git metadata`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "krn-copy-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, ".krn/runs"), { recursive: true });
      writeFileSync(path.join(workspace, ".krn/runs/private"), "PRIVATE_SENTINEL\n");
      writeFileSync(path.join(workspace, ".git"), "gitdir: /not-the-candidate/linked-worktree\n");
      writeFileSync(path.join(workspace, "fixture.txt"), "fixture\n");
      writeFileSync(path.join(workspace, "check.mjs"), CHECK);
      writeFileSync(path.join(dir, "agent.mjs"), AGENT);
      const before = readFileSync(path.join(workspace, ".krn/runs/private"));
      const result = run(runner, dir);
      assert.equal(result.status, 0, result.stderr);
      const verdict = JSON.parse(result.stdout.trim().split("\n").at(-1));
      assert.equal(runner === "lane-runner.mjs" ? verdict.pass : verdict.complete, true, JSON.stringify(verdict));
      assert.deepEqual(readFileSync(path.join(workspace, ".krn/runs/private")), before, "source must stay byte-identical");
      assert.equal(readFileSync(path.join(workspace, ".git"), "utf8"), "gitdir: /not-the-candidate/linked-worktree\n");
      assert.equal(existsSync(path.join(workspace, "observed.json")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${runner} refuses an aliased source rather than copying a symlinked tree`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "krn-copy-alias-"));
    try {
      mkdirSync(path.join(dir, "actual"));
      writeFileSync(path.join(dir, "actual", "fixture.txt"), "fixture\n");
      symlinkSync(path.join(dir, "actual"), path.join(dir, "workspace"));
      writeFileSync(path.join(dir, "agent.mjs"), AGENT);
      const result = run(runner, dir);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /workspace-symlink/);
      assert.equal(readFileSync(path.join(dir, "actual", "fixture.txt"), "utf8"), "fixture\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${runner} refuses a destination inside its source before copying`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "krn-copy-nested-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "temp"), { recursive: true });
      writeFileSync(path.join(workspace, "fixture.txt"), "fixture\n");
      writeFileSync(path.join(workspace, "check.mjs"), CHECK);
      writeFileSync(path.join(dir, "agent.mjs"), AGENT);
      const result = run(runner, dir, { TMPDIR: path.join(workspace, "temp") });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /destination-inside-source/);
      assert.deepEqual(readFileSync(path.join(workspace, "fixture.txt"), "utf8"), "fixture\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
