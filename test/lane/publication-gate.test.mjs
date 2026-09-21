import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  process.stdout.write("t-1\\n");
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
  const tickets = join(repo, ".scratch", "tickets");
  mkdirSync(tickets, { recursive: true });
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
