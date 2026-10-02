import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const ACTIVE = "2030-01-01T00:00:00.000Z";
const EXPIRED = "2030-01-01T01:00:01.000Z";
const LATER = "2030-01-01T03:00:00.000Z";

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "krn-operation-lease-"));
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "-q", "-b", "main");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@krn.local", "commit", "-q", "--allow-empty", "-m", "test: seed lease fixture");
    mkdirSync(join(root, ".krn/runs/lease"), { recursive: true });
    mkdirSync(join(root, "test"));
    const clock = join(root, ".krn/runs/lease/clock.cjs");
    writeFileSync(clock, `const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [process.env.KRN_TEST_NOW])); }
  static now() { return new RealDate(process.env.KRN_TEST_NOW).getTime(); }
};\n`);
    const task = (args, now = ACTIVE) => spawnSync(process.execPath,
      [CLI, "task", ...args, "--root", root, "--json"], {
        cwd: root, encoding: "utf8",
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: `--require=${clock}`, KRN_TEST_NOW: now },
      });
    ok(task(["store", "migrate", "--yes", "--archive", ".krn/runs/lease/archive.json", "--actor", "operator", "--reason", "Initialize isolated operation fixture"]));
    writeFileSync(join(root, "candidate.txt"), "accepted candidate\n");
    writeFileSync(join(root, "test/check.test.mjs"), 'import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nassert.equal(readFileSync("candidate.txt", "utf8"), "accepted candidate\\n");\n');
    const check = "node --test test/check.test.mjs";
    const executed = spawnSync(process.execPath, ["--test", "test/check.test.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    const candidate = git("hash-object", "-w", "candidate.txt");
    writeFileSync(join(root, ".krn/runs/lease/recipe.json"), JSON.stringify({
      base: "main", scope: "candidate.txt", check,
      contract: "test/check.test.mjs:red->green", acceptance: "one current, checked effect",
    }));
    ok(task(["add", "--id", "lease-task", "--title", "Checked lease effect", "--lane-recipe", ".krn/runs/lease/recipe.json"]));
    ok(task(["ready", "--id", "lease-task"]));
    const claim = ok(task(["claim", "--id", "lease-task", "--worker", "owner-a"]));
    assert.equal(claim.lease.at, ACTIVE, "the external clock must control the actual public claim");
    assert.equal(claim.lease.duration, 3600);
    ok(task(["intent", "set", "--intent", "lease-outcome", "--revision", "1", "--expected-revision", "0"]));
    const effect = "refs/krn/effects/lease-test";
    writeFileSync(join(root, ".krn/runs/lease/operation.json"), JSON.stringify({
      id: "lease-operation", taskId: "lease-task", intent: "lease-outcome", intentRevision: 1,
      effectRef: effect, effectObject: candidate, candidateIdentity: candidate,
      checkResult: { candidateIdentity: candidate, command: check, exitCode: executed.status },
      params: { target: candidate, intentRevision: 1 },
    }));
    assert.equal(ok(task(["operation", "prepare", "--file", ".krn/runs/lease/operation.json"])).status, "prepared");
    run({ root, git, task, claim, candidate, effect });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function operation(task, action, worker, epoch, now = ACTIVE) {
  return task(["operation", action, "--id", "lease-operation", "--worker", worker, "--expected-epoch", String(epoch)], now);
}

for (const action of ["apply", "complete"]) {
  test(`public ${action} refuses an expired operation turn before takeover and preserves recovery`, () => {
    fixture(({ root, git, task, claim, candidate, effect }) => {
      if (action === "complete") git("update-ref", effect, candidate);
      const before = git("rev-parse", "refs/krn/queue");
      const refused = operation(task, action, "owner-a", claim.epoch, EXPIRED);
      assert.notEqual(refused.status, 0, `expired ${action} was accepted: ${refused.stdout}`);
      assert.match(refused.stderr, /acceptance|claim|lease/);
      assert.equal(git("rev-parse", "refs/krn/queue"), before, "a refused turn must not mutate the queue");
      assert.equal(ok(task(["show", "--id", "lease-task"])).Status, "claimed");
      if (action === "complete") assert.equal(git("rev-parse", effect), candidate);
      else assert.equal(spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", effect]).status, 1);
      const recovered = ok(task(["takeover", "--id", "lease-task", "--worker", "owner-b", "--expected-epoch", String(claim.epoch), "--reason", "Explicitly recover the expired operation turn"], EXPIRED));
      assert.equal(recovered.epoch, claim.epoch + 1);
      assert.notEqual(operation(task, action, "owner-a", claim.epoch, EXPIRED).status, 0);
      assert.equal(ok(operation(task, action, "owner-b", recovered.epoch, EXPIRED)).status, "observed");
      assert.equal(git("rev-parse", effect), candidate);
      assert.equal(ok(task(["show", "--id", "lease-task"])).Status, "done");
      const receipt = ok(operation(task, "complete", "owner-a", claim.epoch, LATER));
      assert.deepEqual(receipt, { idempotent: true, status: "observed" }, "historical readback does not reapply an effect");
    });
  });

  test(`public ${action} accepts a current checked operation turn`, () => {
    fixture(({ git, task, claim, candidate, effect }) => {
      if (action === "complete") git("update-ref", effect, candidate);
      assert.equal(ok(operation(task, action, "owner-a", claim.epoch)).status, "observed");
      assert.equal(git("rev-parse", effect), candidate);
      assert.equal(ok(task(["show", "--id", "lease-task"])).Status, "done");
    });
  });
}
