import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const task = (root, ...args) => spawnSync(process.execPath, [CLI, "task", ...args, "--root", root, "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
function ok(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function withImported(status, run, { dependency = false, claim = true, gate = "human: operator confirmation" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-public-resume-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const envelope = (id, state, blockedBy = "none", historicalClaim = false) => [
    "<krn-ticket>", `Id: ${id}`, `Title: ${id}`, `Status: ${state}`, "Type: task", "Repository-base: main",
    "Scope: api.mjs", "Deciding check: node --test test/check.test.mjs", "Contract: test/check.test.mjs:red->green",
    "Acceptance: preserve proof and task history", `Blocked by: ${blockedBy}`, `Gate: ${gate}`,
    ...(historicalClaim ? ["Claim: worker=historical-owner; session=old-session; at=2000-01-01T00:00:00Z; epoch=3; renew=2000-01-01T00:00:00Z; duration=3600"] : []),
    "</krn-ticket>", "", "Imported outcome with retained obligations.", "",
  ].join("\n");
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "fixture");
    git("config", "user.email", "fixture@krn.local");
    mkdirSync(join(root, ".krn/tickets"), { recursive: true });
    mkdirSync(join(root, ".krn/runs/resume"), { recursive: true });
    mkdirSync(join(root, "test"));
    mkdirSync(join(root, "docs/research"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".krn/runs/\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "api.mjs"), "export const value = 0;\n");
    writeFileSync(join(root, "test/check.test.mjs"), 'import assert from "node:assert/strict";\nimport { value } from "../api.mjs";\nassert.equal(value, 1);\n');
    writeFileSync(join(root, "docs/research/workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
    writeFileSync(join(root, ".krn/tickets/legacy.md"), envelope("legacy-proof", status, dependency ? "dependency" : "none", claim));
    if (dependency) writeFileSync(join(root, ".krn/tickets/dependency.md"), envelope("dependency", "ready"));
    git("add", ".");
    git("commit", "-q", "-m", "test: seed imported proof task");
    const base = git("rev-parse", "HEAD");
    ok(task(root, "store", "migrate", "--yes", "--archive", ".krn/runs/resume/archive.json", "--actor", "operator", "--reason", "Explicitly import the isolated historical fixture"));
    const before = ok(task(root, "list")).find((item) => item.id === "legacy-proof");
    assert.equal(before.legacyCloseProofRequired, true);
    assert.equal(before.status, status);
    run({ root, git, base, before });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function resume(root, before, options = []) {
  return task(root, "resume", "--id", before.id, "--actor", "operator", "--reason", "Explicitly re-admit the imported task without replacing its proof", "--status", before.status, "--expected-epoch", String(before.epoch), ...options);
}

for (const status of ["deferred", "in-review", "blocked"]) {
  test(`public recovery resumes imported ${status} without erasing proof or replaying the effect`, () => {
    withImported(status, ({ root, git, base, before }) => {
      const queue = git("rev-parse", "refs/krn/queue");
      for (const args of [["ready", "--id", before.id], ["claim", "--id", before.id, "--worker", "new-owner"], ["reopen", "--id", before.id, "--actor", "operator", "--reason", "Resume unfinished work"]]) {
        assert.notEqual(task(root, ...args).status, 0, "the old terminal/ready paths are not a valid nonterminal recovery");
        assert.equal(git("rev-parse", "refs/krn/queue"), queue);
      }
      const resumed = ok(resume(root, before));
      assert.equal(resumed.status, "open");
      for (const key of ["id", "epoch", "sourcePath", "legacyFields", "laneRecipe", "dependencies", "gate", "attempts", "legacyCloseProofRequired"]) assert.deepEqual(resumed[key], before[key], `recovery preserves ${key}`);
      assert.deepEqual(resumed.history.slice(0, before.history.length), before.history);
      assert.equal(resumed.history.at(-1).type, "resumed");
      assert.equal(resumed.history.at(-1).actor, "operator");
      const after = git("rev-parse", "refs/krn/queue");
      assert.notEqual(resume(root, before).status, 0, "a stale repeated transition cannot replay recovery");
      assert.equal(git("rev-parse", "refs/krn/queue"), after);
      assert.notEqual(task(root, "close", "--id", before.id, "--actor", "operator", "--reason", "Declare done without proof").status, 0);
      ok(task(root, "ready", "--id", before.id));
      const claimed = ok(task(root, "claim", "--id", before.id, "--worker", "new-owner"));
      assert.equal(claimed.epoch, before.epoch + 1);
      assert.notEqual(task(root, "close", "--id", before.id, "--actor", "new-owner", "--expected-epoch", String(before.epoch), "--reason", "Use stale history as approval").status, 0);
      writeFileSync(join(root, "api.mjs"), "export const value = 1;\n");
      git("add", "api.mjs");
      git("commit", "-q", "-m", "fix: deliver checked imported outcome", "-m", "Ticket: legacy-proof", "-m", "Change-contract: test/check.test.mjs:red->green");
      const head = git("rev-parse", "HEAD");
      const closed = ok(task(root, "close", "--id", before.id, "--actor", "new-owner", "--expected-epoch", String(claimed.epoch), "--reason", "Read back the checked candidate", "--base", base, "--head", head, "--integrated", head));
      assert.equal(closed.status, "done");
      assert.equal(git("rev-parse", "HEAD"), head, "retrospective close does not replay the code effect");
    });
  });
}

test("public recovery preserves dependency blocking and accepts an imported zero epoch", () => {
  withImported("deferred", ({ root, git, before }) => {
    assert.equal(before.epoch, 0);
    ok(resume(root, before));
    const queue = git("rev-parse", "refs/krn/queue");
    assert.notEqual(task(root, "ready", "--id", before.id).status, 0);
    assert.equal(git("rev-parse", "refs/krn/queue"), queue);
    assert.equal(ok(task(root, "show", "--id", before.id)).Status, "open");
  }, { dependency: true, claim: false });
});

test("public recovery refuses absent authority fields, stale epochs and external gates", () => {
  withImported("in-review", ({ root, git, before }) => {
    const queue = git("rev-parse", "refs/krn/queue");
    const prefix = ["resume", "--id", before.id, "--status", before.status, "--expected-epoch", String(before.epoch)];
    for (const args of [[...prefix, "--reason", "No actor supplied"], [...prefix, "--actor", "operator"], ["resume", "--id", before.id, "--status", before.status, "--actor", "operator", "--reason", "Stale request", "--expected-epoch", String(before.epoch + 1)]]) {
      assert.notEqual(task(root, ...args).status, 0);
      assert.equal(git("rev-parse", "refs/krn/queue"), queue);
    }
  });
  withImported("blocked", ({ root, git, before }) => {
    const queue = git("rev-parse", "refs/krn/queue");
    assert.notEqual(resume(root, before).status, 0, "an unresolved CI gate is not discharged by actor prose");
    assert.equal(git("rev-parse", "refs/krn/queue"), queue);
  }, { gate: "ci: external check remains pending" });
});

test("an explicit lane retry preserves exhaustion history and does not reset its budget", () => {
  withImported("in-review", ({ root, before }) => {
    writeFileSync(join(root, ".krn/runs/resume/lane.json"), JSON.stringify(before.laneRecipe));
    ok(task(root, "add", "--id", "exhausted-lane", "--title", "Retry one failed lane", "--lane-recipe", ".krn/runs/resume/lane.json"));
    ok(task(root, "ready", "--id", "exhausted-lane"));
    const claim = ok(task(root, "claim", "--id", "exhausted-lane", "--worker", "lane-owner"));
    for (let attempt = 1; attempt <= 3; attempt++) {
      const observed = spawnSync(process.execPath, ["--test", "test/check.test.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
      assert.equal(observed.status, 1, "record only the fixture's executed assertion failure");
      ok(task(root, "fail", "--id", "exhausted-lane", "--worker", "lane-owner", "--expected-epoch", String(claim.epoch), "--reason", "Executed check remains red", "--signature", "fixture-check-red"));
    }
    const blocked = ok(task(root, "list")).find((item) => item.id === "exhausted-lane");
    assert.equal(blocked.status, "blocked");
    const resumed = ok(resume(root, blocked));
    assert.deepEqual(resumed.attempts, blocked.attempts);
    assert.deepEqual(resumed.legacyFields, blocked.legacyFields);
    assert.equal(resumed.lane, true);
    assert.deepEqual(resumed.laneRecipe, blocked.laneRecipe);
    ok(task(root, "ready", "--id", blocked.id));
    const retry = ok(task(root, "claim", "--id", blocked.id, "--worker", "new-lane-owner"));
    assert.equal(retry.epoch, claim.epoch + 1);
    assert.notEqual(task(root, "close", "--id", blocked.id, "--actor", "new-lane-owner", "--expected-epoch", String(retry.epoch), "--reason", "Skip the lane proof").status, 0);
    const failed = ok(task(root, "fail", "--id", blocked.id, "--worker", "new-lane-owner", "--expected-epoch", String(retry.epoch), "--reason", "Checked retry still fails", "--signature", "fixture-check-red"));
    assert.equal(failed.attempts, 4);
    assert.equal(failed.status, "blocked", "another turn requires a new explicit operator decision");
  });
});

// Independent acceptance case authored by the read-only Luna reviewer.
test("public recovery refuses an unresolved tracker gate without changing queue or task", () => {
  withImported("blocked", ({ root, git, before }) => {
    const queueBefore = git("rev-parse", "refs/krn/queue");
    const taskBefore = ok(task(root, "show", "--id", before.id));
    const refused = resume(root, before);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /resume cannot discharge an unresolved external or unknown gate/,
      "assert the refusal category rather than merely a nonzero exit");
    assert.equal(git("rev-parse", "refs/krn/queue"), queueBefore);
    assert.deepEqual(ok(task(root, "show", "--id", before.id)), taskBefore);
  }, { gate: "tracker: awaiting external sign-off" });
});
