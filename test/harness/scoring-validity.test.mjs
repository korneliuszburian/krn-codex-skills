import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const HARNESS = path.join(root, "scripts", "lib", "harness", "e2e-compare.mjs");
const AGENT = path.join(root, "scripts", "harness", "opencode-agent.mjs");
const RUNNER = path.join(root, "scripts", "harness", "lane-runner.mjs");

const loadHarness = async () => {
  assert.ok(existsSync(HARNESS), "scripts/lib/harness/e2e-compare.mjs must exist");
  return import("../../scripts/lib/harness/e2e-compare.mjs");
};

const TASK = { id: "validity", check: "node --test test/widget.test.mjs" };
const LANES = ["vanilla", "full"];
const laneOf = (report, name) => report.lanes.find((entry) => entry.lane === name);

async function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-scoring-validity-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withEnv(env, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const agentSource = (body) => ['import fs from "node:fs";', 'try { fs.readFileSync(0, "utf8"); } catch {}', body].join("\n");

const EXIT_AGENT = agentSource("process.exit(3);");
const ZERO_USAGE_AGENT = agentSource('process.stdout.write(`${JSON.stringify({ tokens: 0 })}\\n`);');
const OK_AGENT = agentSource('process.stdout.write(`${JSON.stringify({ tokens: 5 })}\\n`);');

test("an explicit invalid outcome is excluded, never a zero-cost pass", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: () => ({ invalid: true, reason: "provider-failure" }),
  });
  for (const name of LANES) {
    const lane = laneOf(report, name);
    assert.equal(lane.passes, 0, JSON.stringify(lane));
    assert.equal(lane.tokens, 0, JSON.stringify(lane));
    assert.equal(lane.invalid, 2, JSON.stringify(lane));
    assert.equal(lane.estimable, false, JSON.stringify(lane));
    assert.ok(!("passRate" in lane), `an unestimable lane must not report a pass rate: ${JSON.stringify(lane)}`);
    assert.ok(
      lane.trials.every((trial) => trial.invalid === true && trial.reason === "provider-failure"),
      JSON.stringify(lane.trials),
    );
  }
  assert.equal(report.note, "unestimable");
  assert.deepEqual(report.delta, {});
});

test("a genuine task failure stays a failure rather than an invalid trial", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: () => ({ pass: false, tokens: 5, wallSeconds: 1 }),
  });
  const lane = laneOf(report, "vanilla");
  assert.equal(lane.invalid, 0, JSON.stringify(lane));
  assert.equal(lane.estimable, true, JSON.stringify(lane));
  assert.equal(lane.passes, 0, JSON.stringify(lane));
  assert.equal(lane.passRate, 0, JSON.stringify(lane));
  assert.equal(report.note, "no-detectable-delta");
});

test("a provider failure through the runner chain is an invalid trial and an all-invalid comparison is unestimable", async () => {
  const harness = await loadHarness();
  await withTempDir(async (dir) => {
    const agentFile = path.join(dir, "agent.mjs");
    writeFileSync(agentFile, EXIT_AGENT);
    await withEnv({ KRN_HARNESS_LANE_RUNNER: RUNNER, KRN_HARNESS_AGENT: `node ${agentFile}` }, async () => {
      const report = await harness.compareHarness({
        task: { id: "provider", check: "true", workspace: "." },
        lanes: LANES,
        runs: 2,
        root: dir,
      });
      const lane = laneOf(report, "vanilla");
      assert.equal(lane.invalid, 2, JSON.stringify(lane));
      assert.equal(lane.passes, 0, JSON.stringify(lane));
      assert.ok(!("passRate" in lane), JSON.stringify(lane));
      assert.equal(report.note, "unestimable", JSON.stringify(report));
    });
  });
});

test("a zero-usage agent through the runner chain is an invalid trial", async () => {
  const harness = await loadHarness();
  await withTempDir(async (dir) => {
    const agentFile = path.join(dir, "agent.mjs");
    writeFileSync(agentFile, ZERO_USAGE_AGENT);
    await withEnv({ KRN_HARNESS_LANE_RUNNER: RUNNER, KRN_HARNESS_AGENT: `node ${agentFile}` }, async () => {
      const report = await harness.compareHarness({
        task: { id: "zero-usage", check: "true", workspace: "." },
        lanes: LANES,
        runs: 2,
        root: dir,
      });
      const lane = laneOf(report, "vanilla");
      assert.equal(lane.invalid, 2, JSON.stringify(lane));
      assert.equal(lane.tokens, 0, JSON.stringify(lane));
      assert.equal(report.note, "unestimable", JSON.stringify(report));
    });
  });
});

test("a completed agent run with usage stays a valid trial", async () => {
  const harness = await loadHarness();
  await withTempDir(async (dir) => {
    const agentFile = path.join(dir, "agent.mjs");
    writeFileSync(agentFile, OK_AGENT);
    await withEnv({ KRN_HARNESS_LANE_RUNNER: RUNNER, KRN_HARNESS_AGENT: `node ${agentFile}` }, async () => {
      const report = await harness.compareHarness({
        task: { id: "valid", check: "true", workspace: "." },
        lanes: LANES,
        runs: 2,
        root: dir,
      });
      const lane = laneOf(report, "vanilla");
      assert.equal(lane.invalid, 0, JSON.stringify(lane));
      assert.equal(lane.passes, 2, JSON.stringify(lane));
      assert.equal(lane.tokens, 10, JSON.stringify(lane));
      assert.equal(lane.estimable, true, JSON.stringify(lane));
      assert.notEqual(report.note, "unestimable", JSON.stringify(report));
    });
  });
});

function runLaneRunner(dir, agentFile) {
  assert.ok(existsSync(RUNNER), "scripts/harness/lane-runner.mjs must exist");
  return spawnSync(process.execPath, [RUNNER], {
    input: JSON.stringify({ lane: "full", enabled: {}, task: { id: "validity", check: "true", workspace: "." }, root: dir }),
    encoding: "utf8",
    env: { ...process.env, KRN_HARNESS_AGENT: `node ${agentFile}` },
    cwd: dir,
  });
}

test("the lane runner refuses a nonzero agent exit and a zero-usage outcome", async () => {
  await withTempDir(async (dir) => {
    const failing = path.join(dir, "failing.mjs");
    const zero = path.join(dir, "zero.mjs");
    const ok = path.join(dir, "ok.mjs");
    writeFileSync(failing, EXIT_AGENT);
    writeFileSync(zero, ZERO_USAGE_AGENT);
    writeFileSync(ok, OK_AGENT);

    const exited = runLaneRunner(dir, failing);
    assert.equal(exited.status, 2, exited.stderr);
    assert.match(exited.stderr, /agent-failed/);

    const noUsage = runLaneRunner(dir, zero);
    assert.equal(noUsage.status, 2, noUsage.stderr);
    assert.match(noUsage.stderr, /agent-usage-missing/);

    const completed = runLaneRunner(dir, ok);
    assert.equal(completed.status, 0, completed.stderr);
    const line = JSON.parse(completed.stdout.trim().split("\n").filter(Boolean).at(-1));
    assert.equal(line.pass, true, completed.stdout);
    assert.equal(line.tokens, 5, completed.stdout);
  });
});

const FAKE_OK = ['#!/usr/bin/env node', 'process.stdout.write(`${JSON.stringify({ type: "step_finish", part: { tokens: { total: 42 } } })}\\n`);'].join("\n");
const FAKE_EXIT = ["#!/usr/bin/env node", "process.exit(4);"].join("\n");
const FAKE_NO_USAGE = ['#!/usr/bin/env node', 'process.stdout.write(`${JSON.stringify({ type: "text", part: { text: "hi" } })}\\n`);'].join("\n");

function fixtureHome(dir) {
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".agents", "skills"), { recursive: true });
  mkdirSync(path.join(home, ".config", "opencode", "plugins"), { recursive: true });
  mkdirSync(path.join(home, ".local", "share", "opencode"), { recursive: true });
  writeFileSync(path.join(home, ".config", "opencode", "AGENTS.md"), "# KRN contract\n");
  writeFileSync(path.join(home, ".config", "opencode", "opencode.json"), "{}\n");
  writeFileSync(path.join(home, ".local", "share", "opencode", "auth.json"), "{}\n");
  return home;
}

function runAdapter(dir, source) {
  assert.ok(existsSync(AGENT), "scripts/harness/opencode-agent.mjs must exist");
  const fake = path.join(dir, "opencode");
  writeFileSync(fake, source);
  chmodSync(fake, 0o755);
  return spawnSync(process.execPath, [AGENT], {
    input: JSON.stringify({ lane: "full", enabled: { skills: true, brief: true, hooks: true }, prompt: "fix the bug", workspace: root, run: 1, runs: 1 }),
    encoding: "utf8",
    env: { ...process.env, KRN_HARNESS_OPENCODE: fake, KRN_HARNESS_AGENT_HOME: fixtureHome(dir) },
  });
}

test("the opencode adapter refuses a nonzero exit and a usage-less stream", async () => {
  await withTempDir(async (dir) => {
    const exited = runAdapter(dir, FAKE_EXIT);
    assert.equal(exited.status, 2, exited.stderr);
    assert.match(exited.stderr, /opencode-exit-nonzero/);

    const noUsage = runAdapter(dir, FAKE_NO_USAGE);
    assert.equal(noUsage.status, 2, noUsage.stderr);
    assert.match(noUsage.stderr, /opencode-usage-missing/);

    const completed = runAdapter(dir, FAKE_OK);
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(completed.stdout.trim(), JSON.stringify({ tokens: 42 }));
  });
});
