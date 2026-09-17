import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const loadClassifier = async () => {
  try {
    return await import("../../scripts/lib/contract/flake-classify.mjs");
  } catch {
    return null;
  }
};

const tempRoot = () => mkdtempSync(join(tmpdir(), "krn-flake-"));

const coverage = (root, scripts) => ({
  result: scripts.map(([relative, count]) => ({
    url: pathToFileURL(join(root, relative)).href,
    functions: [{ functionName: "", ranges: [{ startOffset: 0, endOffset: 8, count }] }],
  })),
});

const OPERATIONS = [
  "parseCoverage",
  "classifyFailures",
  "retryCandidates",
  "applyRetryOutcomes",
  "flakeReport",
  "collectCoverage",
  "runFlakeAwareSuite",
];

test("the flake classifier loads and exposes its operations", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  for (const name of OPERATIONS) {
    assert.equal(typeof flake[name], "function", `${name} must be a function`);
  }
});

test("parseCoverage keeps executed scripts under the root and drops the rest", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    const payload = coverage(root, [["scripts/a.mjs", 1], ["scripts/b.mjs", 0]]);
    payload.result.push({ url: "node:internal/process", functions: [{ ranges: [{ count: 2 }] }] });
    payload.result.push({
      url: pathToFileURL(join(tmpdir(), "outside.mjs")).href,
      functions: [{ ranges: [{ count: 2 }] }],
    });
    assert.deepEqual([...flake.parseCoverage(payload, { root })], ["scripts/a.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseCoverage accepts a list of coverage payloads", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    const payloads = [coverage(root, [["scripts/a.mjs", 0]]), coverage(root, [["scripts/b.mjs", 2]])];
    assert.deepEqual([...flake.parseCoverage(payloads, { root })], ["scripts/b.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failure that ran no changed file is a suspected flake", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const labels = flake.classifyFailures({
    failures: ["suite fails"],
    changedFiles: ["scripts/a.mjs"],
    executed: ["scripts/unrelated.mjs"],
  });
  assert.deepEqual(labels, [{ name: "suite fails", label: "suspected-flake", evidence: [] }]);
});

test("a failure that ran a changed file is a regression", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const labels = flake.classifyFailures({
    failures: [{ name: "real failure" }],
    changedFiles: ["scripts/a.mjs"],
    executed: ["scripts/b.mjs", "scripts/a.mjs"],
  });
  assert.equal(labels[0].label, "regression");
  assert.deepEqual(labels[0].evidence, ["scripts/a.mjs"]);
});

test("only suspected flakes are offered a retry", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const candidates = flake.retryCandidates([
    { name: "flaky", label: "suspected-flake" },
    { name: "real", label: "regression" },
  ]);
  assert.deepEqual(candidates, ["flaky"]);
});

test("a suspected flake resolves on a passing retry and escalates on a failing one", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const merged = flake.applyRetryOutcomes(
    [
      { name: "flaky", label: "suspected-flake" },
      { name: "persistent", label: "suspected-flake" },
    ],
    { passed: ["flaky"] },
  );
  assert.equal(merged[0].status, "resolved");
  assert.equal(merged[1].status, "failed");
  assert.equal(merged[1].label, "regression");
  assert.equal(merged[1].escalated, true);
});

test("a genuine regression stays failed even when its retry passes", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const [entry] = flake.applyRetryOutcomes([{ name: "real", label: "regression" }], {
    passed: ["real"],
  });
  assert.equal(entry.status, "failed");
  assert.equal(entry.label, "regression");
  assert.equal(entry.retried, false);
});

test("the report prints the label for each failure", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const lines = flake.flakeReport([
    { name: "flaky", label: "suspected-flake" },
    { name: "real", label: "regression" },
  ]);
  assert.deepEqual(lines, ["flaky: suspected-flake", "real: regression"]);
});

test("collectCoverage points the run at a coverage directory and reads it back", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    let seen = null;
    const executed = flake.collectCoverage({
      root,
      env: {},
      run: (env) => {
        seen = env.NODE_V8_COVERAGE;
        writeFileSync(
          join(env.NODE_V8_COVERAGE, "coverage.json"),
          JSON.stringify(coverage(root, [["scripts/a.mjs", 3]])),
        );
      },
    });
    assert.ok(seen, "the runner must receive NODE_V8_COVERAGE");
    assert.deepEqual([...executed], ["scripts/a.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a regression is reported once and never retried", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    let calls = 0;
    const spawn = (command, args, options) => {
      calls += 1;
      writeFileSync(
        join(options.env.NODE_V8_COVERAGE, "coverage.json"),
        JSON.stringify(coverage(root, [["scripts/a.mjs", 1]])),
      );
      return { status: 1, stdout: "TAP version 13\nnot ok 1 - breaks\n", stderr: "" };
    };
    const written = [];
    const result = flake.runFlakeAwareSuite({
      root,
      changedFiles: ["scripts/a.mjs"],
      spawn,
      write: (text) => written.push(text),
      env: {},
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.retried, []);
    assert.equal(result.status, 1);
    assert.deepEqual(written, ["breaks: regression\n"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a suspected flake is retried and can resolve without masking the suite", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    let calls = 0;
    const spawn = (command, args, options) => {
      calls += 1;
      const relative = calls === 1 ? "scripts/unrelated.mjs" : "scripts/a.mjs";
      writeFileSync(
        join(options.env.NODE_V8_COVERAGE, "coverage.json"),
        JSON.stringify(coverage(root, [[relative, 1]])),
      );
      return calls === 1
        ? { status: 1, stdout: "not ok 1 - flaky\n", stderr: "" }
        : { status: 0, stdout: "ok 1 - flaky\n", stderr: "" };
    };
    const result = flake.runFlakeAwareSuite({
      root,
      changedFiles: ["scripts/a.mjs"],
      spawn,
      write: () => {},
      env: {},
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.retried, ["flaky"]);
    assert.equal(result.status, 0);
    assert.equal(result.classifications[0].status, "resolved");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a suspected flake that keeps failing escalates and never goes green", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    const spawn = (command, args, options) => {
      writeFileSync(
        join(options.env.NODE_V8_COVERAGE, "coverage.json"),
        JSON.stringify(coverage(root, [["scripts/unrelated.mjs", 1]])),
      );
      return { status: 1, stdout: "not ok 1 - flaky\n", stderr: "" };
    };
    const result = flake.runFlakeAwareSuite({
      root,
      changedFiles: ["scripts/a.mjs"],
      spawn,
      write: () => {},
      env: {},
    });
    assert.equal(result.status, 1);
    assert.equal(result.classifications[0].label, "regression");
    assert.equal(result.classifications[0].status, "failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a green suite reports no classifications", async () => {
  const flake = await loadClassifier();
  assert.ok(flake, "scripts/lib/contract/flake-classify.mjs must load");
  const root = tempRoot();
  try {
    let reported = false;
    const result = flake.runFlakeAwareSuite({
      root,
      spawn: () => ({ status: 0, stdout: "ok 1 - fine\n", stderr: "" }),
      write: () => {
        reported = true;
      },
      env: {},
    });
    assert.equal(result.status, 0);
    assert.deepEqual(result.classifications, []);
    assert.equal(reported, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
