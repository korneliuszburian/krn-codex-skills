import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const HARNESS = path.join(root, "scripts", "lib", "harness", "e2e-compare.mjs");

const loadHarness = async () => {
  assert.ok(existsSync(HARNESS), "scripts/lib/harness/e2e-compare.mjs must exist");
  return import("../../scripts/lib/harness/e2e-compare.mjs");
};

const TASK = { id: "validity", check: "node --test test/widget.test.mjs" };
const LANES = ["vanilla", "full"];

const laneOf = (report, name) => report.lanes.find((entry) => entry.lane === name);

test("a lane of empty outcomes records invalid trials without a pass or a cost", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: () => ({}),
  });
  const lane = laneOf(report, "vanilla");
  assert.equal(lane.passes, 0);
  assert.equal(lane.tokens, 0);
  assert.equal(lane.wallSeconds, 0);
  assert.equal(lane.invalid, 2);
  assert.equal(lane.trials.length, 2);
  for (const trial of lane.trials) {
    assert.equal(trial.invalid, true, JSON.stringify(trial));
    assert.equal(typeof trial.reason, "string");
    assert.ok(trial.reason.length > 0, JSON.stringify(trial));
  }
  assert.ok(!("passRate" in lane), "an all-invalid lane must not report a pass rate");
  assert.equal(report.note, "unestimable");
});

test("a negative token count is invalid and never reduces the reported cost", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: () => ({ pass: true, tokens: -5, wallSeconds: 1 }),
  });
  const lane = laneOf(report, "full");
  assert.equal(lane.passes, 0, JSON.stringify(lane));
  assert.equal(lane.tokens, 0, JSON.stringify(lane));
  assert.equal(lane.invalid, 2, JSON.stringify(lane));
  assert.equal(lane.trials.length, 2);
  assert.ok(lane.trials.every((trial) => trial.invalid === true));
});

test("valid trials are preserved per run with their pass, tokens, and wall", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: ({ run }) => ({ pass: run === 1, tokens: run, wallSeconds: run / 10 }),
  });
  const lane = laneOf(report, "vanilla");
  assert.equal(lane.invalid, 0);
  assert.equal(lane.passes, 1);
  assert.equal(lane.tokens, 3);
  assert.deepEqual(lane.trials, [
    { run: 1, pass: true, tokens: 1, wallSeconds: 0.1 },
    { run: 2, pass: false, tokens: 2, wallSeconds: 0.2 },
  ]);
});

test("a mixed lane reports passes and invalid separately", async () => {
  const harness = await loadHarness();
  const report = await harness.compareHarness({
    task: TASK,
    lanes: LANES,
    runs: 2,
    runner: ({ run }) => (run === 1 ? { pass: true, tokens: 4, wallSeconds: 0.5 } : {}),
  });
  const lane = laneOf(report, "vanilla");
  assert.equal(lane.passes, 1, JSON.stringify(lane));
  assert.equal(lane.invalid, 1, JSON.stringify(lane));
  assert.equal(lane.tokens, 4, JSON.stringify(lane));
  assert.equal(lane.wallSeconds, 0.5, JSON.stringify(lane));
  assert.equal(lane.passRate, 1, JSON.stringify(lane));
  assert.equal(lane.trials.length, 2);
  const invalid = lane.trials.find((trial) => trial.invalid === true);
  assert.equal(invalid.run, 2, JSON.stringify(lane.trials));
});
