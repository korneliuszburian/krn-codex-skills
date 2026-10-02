import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const REAL_GIT = realpathSync(process.env.PATH.split(delimiter).map((dir) => join(dir, "git")).find((file) => existsSync(file)));
function ok(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "krn-completion-race-"));
  const git = (...args) => {
    const r = spawnSync(REAL_GIT, ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const task = (args, env = process.env) => spawnSync(process.execPath, [CLI, "task", ...args, "--root", root, "--json"], { cwd: root, encoding: "utf8", env: { ...env, NODE_TEST_CONTEXT: undefined } });
  try {
    git("init", "-q", "-b", "main");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@krn.local", "commit", "-q", "--allow-empty", "-m", "test: seed completion fixture");
    mkdirSync(join(root, ".krn/runs/completion"), { recursive: true });
    mkdirSync(join(root, "test"));
    ok(task(["store", "migrate", "--yes", "--archive", ".krn/runs/completion/archive.json", "--actor", "operator", "--reason", "Initialize isolated completion fixture"]));
    writeFileSync(join(root, "candidate.txt"), "checked candidate\n");
    writeFileSync(join(root, "other.txt"), "another writer's effect\n");
    writeFileSync(join(root, "test/check.test.mjs"), 'import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nassert.equal(readFileSync("candidate.txt", "utf8"), "checked candidate\\n");\n');
    const check = "node --test test/check.test.mjs";
    const checked = spawnSync(process.execPath, ["--test", "test/check.test.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    const candidate = git("hash-object", "-w", "candidate.txt");
    const other = git("hash-object", "-w", "other.txt");
    writeFileSync(join(root, ".krn/runs/completion/recipe.json"), JSON.stringify({ base: "main", scope: "candidate.txt", check, contract: "test/check.test.mjs:red->green", acceptance: "close only the current effect" }));
    ok(task(["add", "--id", "completion-task", "--title", "Observe one checked effect", "--lane-recipe", ".krn/runs/completion/recipe.json"]));
    ok(task(["ready", "--id", "completion-task"]));
    const claim = ok(task(["claim", "--id", "completion-task", "--worker", "integrator"]));
    ok(task(["intent", "set", "--intent", "completion-outcome", "--revision", "1", "--expected-revision", "0"]));
    const effect = "refs/krn/effects/completion-test";
    writeFileSync(join(root, ".krn/runs/completion/operation.json"), JSON.stringify({ id: "completion-op", taskId: "completion-task", intent: "completion-outcome", intentRevision: 1,
      effectRef: effect, effectObject: candidate, candidateIdentity: candidate, checkResult: { candidateIdentity: candidate, command: check, exitCode: checked.status }, params: { target: candidate, intentRevision: 1 } }));
    assert.equal(ok(task(["operation", "prepare", "--file", ".krn/runs/completion/operation.json"])).status, "prepared");
    git("update-ref", effect, candidate);
    const complete = (env) => task(["operation", "complete", "--id", "completion-op", "--worker", "integrator", "--expected-epoch", String(claim.epoch)], env);
    run({ root, git, task, complete, candidate, other, effect });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function raceEnvironment(root, effect, other, deleteEffect = false) {
  const bin = join(root, "race-bin");
  mkdirSync(bin);
  const marker = join(root, ".krn/runs/completion/race-fired");
  writeFileSync(join(bin, "git"), `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const input = args.includes("--stdin") ? fs.readFileSync(0) : undefined;
const queueWrite = args.includes("update-ref") && (args.includes("refs/krn/queue") || input?.toString().includes("update refs/krn/queue "));
if (queueWrite) {
  const moved = spawnSync(${JSON.stringify(REAL_GIT)}, ${JSON.stringify(deleteEffect ? ["-C", root, "update-ref", "-d", effect] : ["-C", root, "update-ref", effect, other])}, { encoding: "utf8" });
  if (moved.status !== 0) { process.stderr.write(moved.stderr); process.exit(moved.status ?? 1); }
  fs.writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(deleteEffect ? "effect deleted at queue-write boundary" : "effect moved at queue-write boundary")});
}
const result = spawnSync(${JSON.stringify(REAL_GIT)}, args, { input, encoding: "utf8" });
process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
`, { mode: 0o700 });
  return { marker, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` } };
}

test("public completion atomically refuses an effect moved after its last readback", () => {
  fixture(({ root, git, task, complete, other, effect }) => {
    const queue = git("rev-parse", "refs/krn/queue");
    const before = ok(task(["show", "--id", "completion-task"]));
    const { marker, env } = raceEnvironment(root, effect, other);
    const result = complete(env);
    assert.equal(readFileSync(marker, "utf8"), "effect moved at queue-write boundary", "the actual Git interleaving must execute");
    assert.notEqual(result.status, 0, `completion falsely accepted a moved effect: ${result.stdout}`);
    assert.match(result.stderr, /changed|compare|transaction|verify|ref/);
    assert.equal(git("rev-parse", "refs/krn/queue"), queue, "ref verification and queue CAS are one transaction");
    assert.equal(git("rev-parse", effect), other, "do not overwrite another writer's effect");
    assert.deepEqual(ok(task(["show", "--id", "completion-task"])), before);
    assert.equal(ok(complete()).status, "ambiguous", "read back before deciding any retry");
    assert.equal(git("rev-parse", "refs/krn/queue"), queue);
  });
});

test("public completion observes an unchanged checked effect without reapplying it", () => {
  fixture(({ git, task, complete, candidate, effect }) => {
    assert.equal(ok(complete()).status, "observed");
    assert.equal(git("rev-parse", effect), candidate);
    assert.equal(ok(task(["show", "--id", "completion-task"])).Status, "done");
    const queue = git("rev-parse", "refs/krn/queue");
    assert.deepEqual(ok(complete()), { idempotent: true, status: "observed" });
    assert.equal(git("rev-parse", "refs/krn/queue"), queue);
  });
});

// Producer-independent deletion interleaving authored by the read-only Luna reviewer.
test("public completion refuses a concurrent effect-ref deletion at the queue-write boundary", () => {
  fixture(({ root, git, task, complete, other, effect }) => {
    const queueBefore = git("rev-parse", "refs/krn/queue");
    const taskBefore = ok(task(["show", "--id", "completion-task"]));
    const { marker, env } = raceEnvironment(root, effect, other, true);
    const result = complete(env);
    assert.equal(readFileSync(marker, "utf8"), "effect deleted at queue-write boundary",
      "the concurrent real-Git deletion must occur at the final queue-write boundary");
    assert.notEqual(result.status, 0, `completion accepted after effect deletion: ${result.stdout}`);
    assert.equal(git("rev-parse", "refs/krn/queue"), queueBefore);
    assert.notEqual(spawnSync(REAL_GIT, ["-C", root, "rev-parse", "--verify", "--quiet", effect]).status, 0,
      "the concurrent deletion remains in effect");
    assert.deepEqual(ok(task(["show", "--id", "completion-task"])), taskBefore);
    assert.equal(ok(complete()).status, "ambiguous", "missing readback must not replay the effect");
    assert.equal(git("rev-parse", "refs/krn/queue"), queueBefore);
    assert.notEqual(spawnSync(REAL_GIT, ["-C", root, "rev-parse", "--verify", "--quiet", effect]).status, 0);
  });
});
