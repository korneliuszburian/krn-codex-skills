import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";
import { activateTaskQueueFixture } from "../ticket/task-queue-fixture.mjs";

const frontier = fileURLToPath(new URL("../../scripts/lane/run-frontier.sh", import.meta.url));
const LANE_BRANCH = "ticket/lane-t-1";
const LANE_SUBJECT = "lane work (t-1)";

const git = (cwd, args) => {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stdout}${result.stderr}`);
  return result.stdout;
};

const krnStub = (ticketPath) => `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const sub = process.argv[3];
const closeLog = process.env.STUB_CLOSE_LOG;
if (sub === "next") {
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify({root: process.cwd(), frontier: ["t-1"]}) + "\\n");
  else process.stdout.write("t-1\\n");
} else if (sub === "show") {
  process.stderr.write("krn: Git-ref task queue is not active; Markdown remains authoritative\\n");
  process.exit(64);
} else if (sub === "claim") {
  process.stdout.write(JSON.stringify({ path: ${JSON.stringify(ticketPath)} }) + "\\n");
} else if (sub === "close" && closeLog) {
  appendFileSync(closeLog, "close\\n");
}
`;

const laneStub = () => `#!/usr/bin/env bash
set -euo pipefail
branch=${LANE_BRANCH}
git -C "$FIXTURE" checkout -q -b "$branch"
printf 'lane work\\n' > "$FIXTURE/lane-artifact.txt"
git -C "$FIXTURE" add -A
git -C "$FIXTURE" -c user.email=lane@lab.invalid -c user.name=lane commit -q -m "${LANE_SUBJECT}"
git -C "$FIXTURE" checkout -q main
echo "branch=$branch"
`;

const TICKET_BODY = "<krn-ticket>\nId: t-1\nStatus: ready\n</krn-ticket>\n";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lane-publish-gate-"));
  const repo = join(dir, "repo");
  const tickets = join(repo, ".krn", "tickets");
  mkdirSync(tickets, { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });
  mkdirSync(join(repo, "docs", "research"), { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "lane-fixture", scripts: { "test:a": "node --test test/a.test.mjs" } }));
  writeFileSync(join(repo, "test", "new.test.mjs"), `import assert from "node:assert/strict";
import test from "node:test";
test("fixture base observer passes", () => assert.equal(1, 1));
`);
  writeFileSync(join(repo, "docs", "research", "workflow-lessons.md"), `# Workflow lessons

Status: \`accepted\`. Consumer: operator. Owner: maintainer. Verified: 2026-09-24.

| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |
|---|---|---|---|---|---|---|
`);
  const ticketPath = join(tickets, "t-1.md");
  writeFileSync(ticketPath, TICKET_BODY);

  git(repo, ["init", "-q"]);
  git(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "chore: initial"]);

  const krnPath = join(dir, "krn-stub.mjs");
  writeFileSync(krnPath, krnStub(ticketPath));
  const lanePath = join(dir, "lane-stub.sh");
  writeFileSync(lanePath, laneStub());
  chmodSync(lanePath, 0o755);
  const logDir = join(dir, "runs-frontier");
  const closeLog = join(dir, "close.log");

  return { dir, repo, tickets, krnPath, lanePath, logDir, closeLog };
}

function envFor({ repo, tickets, krnPath, lanePath, logDir, closeLog }, gate) {
  const env = {
    ...process.env,
    ROOT: repo,
    TICKETS: tickets,
    KRN: krnPath,
    LANE: lanePath,
    MAX_RUNS: "1",
    LOG_DIR: logDir,
    STUB_CLOSE_LOG: closeLog,
  };
  if (gate === undefined) delete env.PUBLISH_GATE;
  else env.PUBLISH_GATE = gate;
  return env;
}

const runFrontier = (env) => spawnSync("bash", [frontier], { encoding: "utf8", cwd: env.ROOT, env });

const subjects = (repo) => git(repo, ["log", "--format=%s"]);

test("the frontier refuses to merge and close when PUBLISH_GATE is unset", () => {
  const fixture = setup();
  try {
    const result = runFrontier(envFor(fixture, undefined));
    assert.notEqual(result.status, 0, `an unset gate must refuse: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /publication gate required/, "the refusal must name the missing gate");
    assert.ok(!subjects(fixture.repo).includes(LANE_SUBJECT), "the lane commit must not be merged");
    assert.equal(git(fixture.repo, ["rev-parse", "--verify", LANE_BRANCH]).trim().length, 40, "the lane branch must still exist unmerged");
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("the frontier refuses to merge and close when PUBLISH_GATE fails", () => {
  const fixture = setup();
  try {
    const result = runFrontier(envFor(fixture, "false"));
    assert.notEqual(result.status, 0, `a failing gate must refuse: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /publication gate failed/, "the refusal must name the failed gate");
    assert.ok(!subjects(fixture.repo).includes(LANE_SUBJECT), "the lane commit must not be merged");
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("the frontier merges and closes only when PUBLISH_GATE passes", () => {
  const fixture = setup();
  try {
    const result = runFrontier(envFor(fixture, "true"));
    assert.equal(result.status, 0, `a passing gate must merge: ${result.stdout}${result.stderr}`);
    assert.ok(subjects(fixture.repo).includes(LANE_SUBJECT), "the lane commit must be present after the merge");
    assert.equal(git(fixture.repo, ["rev-parse", "--verify", "HEAD^2"]).trim().length, 40, "the merge must be a real merge commit");
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("the frontier claims an active Git-ref task by ID and passes only that ID to the lane", async () => {
  const fixture = setup();
  try {
    const gitPath = execFileSync("git", ["-C", fixture.repo, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const store = openTaskStore(gitPath);
    await store.setIntentRevision("active-outcome", 1);
    const task = await store.add({
      id: "active-t-1",
      title: "Use the task store lane adapter",
      lane: true,
      laneRecipe: {
        base: "main",
        scope: "package.json,test/new.test.mjs",
        check: "node --test test/new.test.mjs",
        contract: "test/new.test.mjs:green->green",
        acceptance: "test/new.test.mjs is claimed and routed by task ID",
      },
    });
    await store.markReady(task.id);
    activateTaskQueueFixture(fixture.repo);

    const receiptPath = join(fixture.dir, "lane-input.txt");
    const activeLane = join(fixture.dir, "active-lane.sh");
    writeFileSync(activeLane, `#!/usr/bin/env bash
set -euo pipefail
printf 'KRN_TASK_ID=%s\\nTICKET=%s\\n' "\${KRN_TASK_ID:-}" "\${TICKET:-}" > "\${LANE_RECEIPT}"
branch=ticket/lane-active-t-1
git -C "$FIXTURE" checkout -q -b "$branch"
printf 'active lane work\\n' > "$FIXTURE/active-lane-artifact.txt"
git -C "$FIXTURE" add -A
git -C "$FIXTURE" -c user.email=lane@lab.invalid -c user.name=lane commit -q -m 'active lane work'
git -C "$FIXTURE" checkout -q main
echo "branch=$branch"
`);
    chmodSync(activeLane, 0o755);

    const env = envFor(fixture, undefined);
    env.KRN = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
    env.LANE = activeLane;
    env.LANE_RECEIPT = receiptPath;
    env.WORKER_NAME = "frontier-active-worker";
    env.KRN_INTENT_ID = "active-outcome";

    const result = runFrontier(env);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /publication gate required/);
    assert.equal(readFileSync(receiptPath, "utf8"), "KRN_TASK_ID=active-t-1\nTICKET=\n");
    const claimed = await store.show(task.id);
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.owner, "frontier-active-worker");
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("active frontier integration prepares, applies and reads back one candidate-bound operation", async () => {
  const fixture = setup();
  try {
    const store = openTaskStore(fixture.repo);
    await store.setIntentRevision("self-hardening", 1);
    const task = await store.add({
      id: "active-integration-t1",
      title: "Integrate a checked candidate through the operation protocol",
      lane: true,
      laneRecipe: {
        base: "main",
        scope: "package.json,test/new.test.mjs,test/epoch-marker.txt",
        check: "node --test test/new.test.mjs",
        contract: "test/new.test.mjs:green->green",
        acceptance: "test/new.test.mjs is changed and passes on the immutable merge candidate before the target ref changes",
      },
    });
    await store.markReady(task.id);
    activateTaskQueueFixture(fixture.repo);

    const activeLane = join(fixture.dir, "active-integrator-lane.sh");
    writeFileSync(activeLane, `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = classify ]; then
  WORK_ROOT="\${WORK_ROOT}" bash "\${LANE_CLASSIFIER}" classify "\${2}"
  exit $?
fi
branch=ticket/lane-active-integration-\${KRN_CLAIM_EPOCH}
git -C "$FIXTURE" checkout -q -b "$branch"
printf 'claim epoch %s\\n' "$KRN_CLAIM_EPOCH" > "$FIXTURE/test/epoch-marker.txt"
mkdir -p "$FIXTURE/test"
cat > "$FIXTURE/test/new.test.mjs" <<'JS'
import assert from 'node:assert/strict';
import test from 'node:test';
test('candidate integration works', () => assert.equal(2, 2));
JS
printf '\\n// claim epoch %s\\n' "$KRN_CLAIM_EPOCH" >> "$FIXTURE/test/new.test.mjs"
git -C "$FIXTURE" add -A
git -C "$FIXTURE" -c user.email=lane@lab.invalid -c user.name=lane commit -q \\
  -m 'feat: add the candidate test' \\
  -m 'Ticket: active-integration-t1' \\
  -m 'Change-contract: test/new.test.mjs:green->green'
git -C "$FIXTURE" checkout -q main
echo "branch=$branch"
`);
    chmodSync(activeLane, 0o755);

    const env = envFor(fixture, "true");
    env.KRN = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
    env.LANE = activeLane;
    env.LANE_CLASSIFIER = fileURLToPath(new URL("../../scripts/lane/run-ticket.sh", import.meta.url));
    env.WORKER_NAME = "frontier-active-integrator";
    env.KRN_INTENT_ID = "self-hardening";
    env.KRN_INTENT_REVISION = "1";

    const result = runFrontier(env);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const taskState = await store.read();
    assert.equal(taskState.tasks[task.id].status, "done");
    const operation = taskState.operations[`integrate:${task.id}:${taskState.tasks[task.id].epoch}`];
    assert.equal(operation.status, "observed");
    assert.equal(operation.candidateIdentity, operation.effectObject);
    assert.equal(git(fixture.repo, ["rev-parse", "refs/heads/main"]).trim(), operation.effectObject);
    assert.match(git(fixture.repo, ["log", "-1", "--format=%B"]), new RegExp(`merge: integrate ticket/lane-active-integration[\\s\\S]*Ticket: ${task.id}[\\s\\S]*Change-contract: test/new\\.test\\.mjs:green->green`));
    assert.deepEqual((await store.check()).errors, []);

    await store.reopen(task.id, { actor: "operator", reason: "run the accepted lane task again" });
    await store.markReady(task.id);
    const retry = runFrontier(env);
    assert.equal(retry.status, 0, `reopened task gets a fresh integration operation: ${retry.stdout}${retry.stderr}`);
    const retried = await store.read();
    assert.equal(retried.tasks[task.id].epoch, 2);
    assert.equal(retried.operations[`integrate:${task.id}:1`].status, "observed");
    assert.equal(retried.operations[`integrate:${task.id}:2`].status, "observed");
    assert.notEqual(retried.operations[`integrate:${task.id}:1`].effectObject, retried.operations[`integrate:${task.id}:2`].effectObject);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("active frontier refuses to update a target ref that differs from the task Repository-base", async () => {
  const fixture = setup();
  try {
    git(fixture.repo, ["checkout", "-q", "-b", "alternate-base"]);
    git(fixture.repo, ["commit", "-q", "--allow-empty", "-m", "advance alternate base"]);
    git(fixture.repo, ["checkout", "-q", "main"]);
    const targetBefore = git(fixture.repo, ["rev-parse", "HEAD"]).trim();
    const store = openTaskStore(fixture.repo);
    await store.setIntentRevision("self-hardening", 1);
    const task = await store.add({
      id: "active-base-mismatch",
      title: "Refuse an integration against the wrong base",
      lane: true,
      laneRecipe: {
        base: "alternate-base",
        scope: "package.json,test/new.test.mjs",
        check: "node --test test/new.test.mjs",
        contract: "test/new.test.mjs:green->green",
        acceptance: "the lane integrates only into its exact declared base",
      },
    });
    await store.markReady(task.id);
    activateTaskQueueFixture(fixture.repo);

    const lane = join(fixture.dir, "wrong-base-lane.sh");
    writeFileSync(lane, `#!/usr/bin/env bash
set -euo pipefail
branch=ticket/lane-wrong-base
git -C "$FIXTURE" checkout -q -b "$branch"
git -C "$FIXTURE" -c user.email=lane@lab.invalid -c user.name=lane commit -q --allow-empty -m 'feat: lane against fixture base'
git -C "$FIXTURE" checkout -q main
echo "branch=$branch"
`);
    chmodSync(lane, 0o755);
    const env = envFor(fixture, "true");
    env.KRN = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
    env.LANE = lane;
    env.WORKER_NAME = "wrong-base-worker";
    env.KRN_INTENT_ID = "self-hardening";

    const result = runFrontier(env);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /but the task lane used base/);
    assert.equal(git(fixture.repo, ["rev-parse", "HEAD"]).trim(), targetBefore, "a mismatched base must leave the target ref untouched");
    assert.deepEqual((await store.read()).operations, {});
    assert.equal((await store.show(task.id)).status, "claimed");
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("intent revocation that wins the Git ref transaction prevents the integration effect", async () => {
  const fixture = setup();
  try {
    const store = openTaskStore(fixture.repo);
    await store.setIntentRevision("revocable-outcome", 1);
    const task = await store.add({
      id: "intent-race-task",
      title: "Fence a local effect against a concurrent revocation",
      lane: true,
      laneRecipe: {
        base: "main",
        scope: "test/new.test.mjs",
        check: "node --test test/new.test.mjs",
        contract: "test/new.test.mjs:green->green",
        acceptance: "revocation before the atomic Git ref transaction leaves the target unchanged",
      },
    });
    await store.markReady(task.id);
    activateTaskQueueFixture(fixture.repo);

    const lane = join(fixture.dir, "revocable-lane.sh");
    writeFileSync(lane, `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = classify ]; then
  WORK_ROOT="\${WORK_ROOT}" bash "\${LANE_CLASSIFIER}" classify "\${2}"
  exit $?
fi
branch=ticket/intent-race-\${KRN_CLAIM_EPOCH}
git -C "$FIXTURE" checkout -q -b "$branch"
cat > "$FIXTURE/test/new.test.mjs" <<'JS'
import assert from 'node:assert/strict';
import test from 'node:test';
test('effect authorized before revocation', () => assert.equal(1, 1));
JS
git -C "$FIXTURE" add -A
git -C "$FIXTURE" -c user.email=lane@lab.invalid -c user.name=lane commit -q \\
  -m 'feat: prepare revocable integration' \\
  -m 'Ticket: intent-race-task' \\
  -m 'Change-contract: test/new.test.mjs:green->green'
git -C "$FIXTURE" checkout -q main
echo "branch=$branch"
`);
    chmodSync(lane, 0o755);

    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const marker = join(fixture.dir, "intent-revoked");
    const mutator = join(fixture.dir, "revoke-intent.mjs");
    writeFileSync(mutator, `import { openTaskStore } from ${JSON.stringify(fileURLToPath(new URL("../../scripts/lib/ticket/task-store.mjs", import.meta.url)))};
await openTaskStore(process.env.REVOKE_ROOT).setIntentRevision("revocable-outcome", 2, { expectedRevision: 1 });
`);
    const bin = join(fixture.dir, "bin");
    mkdirSync(bin);
    const gitWrapper = join(bin, "git");
    writeFileSync(gitWrapper, `#!/usr/bin/env bash
set -euo pipefail
args=("$@")
maybe_revoke() {
  if [ -e "$REVOKE_MARKER" ]; then return; fi
  touch "$REVOKE_MARKER"
  PATH="$REAL_PATH" "$REAL_NODE" "$REVOKE_SCRIPT"
}
if [ "\${1:-}" = -C ] && [ "\${3:-}" = update-ref ] && [ "\${4:-}" = --stdin ]; then
  input=$(cat)
  if [[ "$input" == *"refs/heads/main"* && "$input" == *"refs/krn/queue"* ]]; then
    maybe_revoke
    printf '%s\\n' "$input" | "$REAL_GIT" "\${args[@]}"
    exit $?
  fi
  printf '%s\\n' "$input" | "$REAL_GIT" "\${args[@]}"
  exit $?
fi
if [ "\${1:-}" = -C ] && [ "\${3:-}" = update-ref ] && [ "\${4:-}" = refs/heads/main ]; then
  maybe_revoke
fi
exec "$REAL_GIT" "\${args[@]}"
`);
    chmodSync(gitWrapper, 0o755);

    const env = envFor(fixture, "true");
    env.PATH = `${bin}:${process.env.PATH}`;
    env.KRN = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
    env.LANE = lane;
    env.LANE_CLASSIFIER = fileURLToPath(new URL("../../scripts/lane/run-ticket.sh", import.meta.url));
    env.WORKER_NAME = "intent-race-worker";
    env.KRN_INTENT_ID = "revocable-outcome";
    env.REVOKE_MARKER = marker;
    env.REVOKE_SCRIPT = mutator;
    env.REVOKE_ROOT = fixture.repo;
    env.REAL_GIT = realGit;
    env.REAL_NODE = process.execPath;
    env.REAL_PATH = process.env.PATH;

    const targetBefore = git(fixture.repo, ["rev-parse", "HEAD"]).trim();
    const result = runFrontier(env);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(git(fixture.repo, ["rev-parse", "refs/heads/main"]).trim(), targetBefore, "revocation wins before effect and leaves the branch unchanged");
    assert.equal((await store.read()).intents["revocable-outcome"], 2, `${result.stdout}${result.stderr}`);
    const state = await store.read();
    assert.equal(state.tasks[task.id].status, "claimed");
    assert.deepEqual(Object.values(state.operations).map((operation) => operation.status), ["prepared"]);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
