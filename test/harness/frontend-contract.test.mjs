import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import * as harness from "../../scripts/lib/harness/e2e-compare.mjs";

const { compareHarness, loadTask } = harness;
const contract = await import("../../scripts/lib/harness/frontend-contract.mjs").catch(() => null);

const AXES = [
  "execution",
  "behavior",
  "accessibility",
  "responsive",
  "geometry",
  "visual",
  "architecture",
  "efficiency",
  "provenance",
];

const taskSource = (payload) => `# Sealed harness task\n\n\`\`\`krn-harness-task\n${JSON.stringify(payload)}\n\`\`\`\n`;

function validTask(overrides = {}) {
  const axes = Object.fromEntries(AXES.map((axis) => [axis, {
    applicable: false,
    reason: `${axis} is outside this fixture`,
  }]));
  axes.execution = { applicable: true, requirementIds: ["REQ-EXEC"] };
  axes.architecture = { applicable: true, requirementIds: ["REQ-CUBE"] };
  return {
    schema: "krn.frontend-harness.task.v2",
    id: "card-section",
    track: "design-transfer",
    prompt: "Build the public card section.",
    public: {
      workspace: "fixtures/card/public",
      requirements: [
        { id: "REQ-EXEC", statement: "The page builds without runtime errors." },
        { id: "REQ-CUBE", statement: "The card follows the admitted CUBE recipe." },
      ],
    },
    evaluator: {
      identity: "card-section-evaluator-v1",
      workspace: "fixtures/card/sealed",
    },
    environment: { identity: "chromium-linux-fontset-v1" },
    viewports: [{ id: "mobile", width: 320, height: 800 }],
    perturbations: [],
    statePaths: [{ id: "initial", transitions: [] }],
    evidence: [{ id: "dom", axis: "architecture", path: "evidence/dom.json" }],
    axes,
    ...overrides,
  };
}

function validEvaluator(overrides = {}) {
  return {
    schema: "krn.frontend-harness.evaluator.v2",
    taskId: "card-section",
    assertions: [
      { id: "ASSERT-EXEC", requirementId: "REQ-EXEC", track: "design-transfer", axis: "execution" },
      { id: "ASSERT-CUBE", requirementId: "REQ-CUBE", track: "design-transfer", axis: "architecture" },
    ],
    ...overrides,
  };
}

function validResult(task, overrides = {}) {
  const axes = Object.fromEntries(AXES.map((axis) => {
    const contract = task.axes[axis];
    return contract.applicable
      ? [axis, { status: "pass", measurements: [], evidence: [] }]
      : [axis, { status: "not-applicable", reason: contract.reason }];
  }));
  return {
    schema: "krn.frontend-harness.result.v2",
    taskId: task.id,
    track: task.track,
    environmentIdentity: task.environment.identity,
    axes,
    ...overrides,
  };
}

async function withTask(payload, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-sealed-contract-"));
  try {
    const file = path.join(dir, "task.md");
    writeFileSync(file, taskSource(payload));
    return await run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("v2 admits two tracks and preserves every public runner field", async () => {
  assert.ok(contract, "the sealed v2 contract module must exist");
  for (const track of ["design-transfer", "source-fidelity"]) {
    await withTask(validTask({ track }), async (file) => {
      const task = loadTask(file);
      assert.equal(task.schema, "krn.frontend-harness.task.v2");
      assert.equal(task.track, track);
      assert.equal(task.workspace, "fixtures/card/public");
      assert.deepEqual(Object.keys(task.axes), AXES);
      assert.equal(task.public.requirements[1].id, "REQ-CUBE");
      assert.equal(task.evaluator.identity, "card-section-evaluator-v1");
      assert.equal(task.environment.identity, "chromium-linux-fontset-v1");
      assert.equal(task.viewports[0].width, 320);
      assert.equal(task.statePaths[0].id, "initial");
      assert.equal(task.evidence[0].axis, "architecture");
    });
  }
});

test("v2 admission rejects malformed authority and incomplete applicability", async () => {
  const cases = [
    [validTask({ schema: "krn.harness.task.v2" }), /unknown-task-version/],
    [validTask({ track: "pixel-clone" }), /malformed-track/],
    [validTask({ environment: {} }), /missing-environment-identity/],
    [validTask({ evaluator: { identity: "x", workspace: "fixtures/card/public/oracle" } }), /evaluator-inside-public-workspace/],
    [validTask({ axes: { ...validTask().axes, visual: undefined } }), /missing-axis-applicability/],
    [validTask({ axes: { ...validTask().axes, visual: { applicable: false } } }), /unjustified-not-applicable/],
    [validTask({ weightedAggregate: { visual: 0.5 } }), /weighted-aggregate/],
  ];
  for (const [payload, expected] of cases) {
    await withTask(payload, (file) => assert.throws(() => loadTask(file), expected));
  }
});

test("sealed assertions must map to a public requirement, track, and applicable axis", async () => {
  await withTask(validTask(), (file) => {
    const task = loadTask(file);
    assert.equal(contract.admitSealedEvaluator(task, validEvaluator()).assertions.length, 2);
    assert.throws(
      () => contract.admitSealedEvaluator(task, validEvaluator({ assertions: [{ id: "HIDDEN", requirementId: "REQ-HIDDEN", track: task.track, axis: "architecture" }] })),
      /hidden-requirement/,
    );
    assert.throws(
      () => contract.admitSealedEvaluator(task, validEvaluator({ assertions: [{ id: "WRONG-TRACK", requirementId: "REQ-CUBE", track: "source-fidelity", axis: "architecture" }] })),
      /assertion-track-mismatch/,
    );
    assert.throws(
      () => contract.admitSealedEvaluator(task, validEvaluator({ assertions: [{ id: "NA", requirementId: "REQ-CUBE", track: task.track, axis: "visual" }] })),
      /assertion-axis-not-applicable/,
    );
    assert.throws(
      () => contract.admitSealedEvaluator(task, validEvaluator({ assertions: [{ id: "ONLY-ONE", requirementId: "REQ-CUBE", track: task.track, axis: "architecture" }] })),
      /requirement-without-assertion/,
    );
  });
});

test("v2 results distinguish missing measurements from justified non-applicability", async () => {
  await withTask(validTask(), (file) => {
    const task = loadTask(file);
    const admitted = contract.admitV2Result(task, validResult(task));
    assert.equal(admitted.axes.execution.status, "pass");
    assert.equal(admitted.axes.visual.status, "not-applicable");

    const missing = validResult(task);
    delete missing.axes.execution.measurements;
    assert.throws(() => contract.admitV2Result(task, missing), /missing-axis-measurements/);

    const falseNa = validResult(task);
    falseNa.axes.execution = { status: "not-applicable", reason: "not measured" };
    assert.throws(() => contract.admitV2Result(task, falseNa), /false-result-applicability/);

    assert.throws(() => contract.admitV2Result(task, validResult(task, { weightedScore: 0.9 })), /weighted-aggregate/);
  });
});

test("v2 admission refuses nested weighted aggregate authority in every envelope", async () => {
  await withTask(validTask({ summary: { weightedScore: 0.9 } }), (file) => {
    assert.throws(() => loadTask(file), /weighted-aggregate/);
  });
  await withTask(validTask(), (file) => {
    const task = loadTask(file);
    assert.throws(
      () => contract.admitSealedEvaluator(task, validEvaluator({ summary: { weights: { execution: 1 } } })),
      /weighted-aggregate/,
    );
    assert.throws(
      () => contract.admitV2Result(task, validResult(task, { summary: { overallScore: 1 } })),
      /weighted-aggregate/,
    );
  });
});

test("v2 fields round-trip from harness dispatch into independent-axis results", async () => {
  await withTask(validTask(), async (file) => {
    const task = loadTask(file);
    const seen = [];
    const report = await compareHarness({
      task,
      lanes: ["vanilla", "full"],
      runs: 1,
      runner: ({ task: dispatched, lane }) => {
        seen.push({ lane, task: dispatched });
        return { result: validResult(dispatched) };
      },
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].task.evaluator.identity, task.evaluator.identity);
    assert.deepEqual(seen[0].task.public.requirements, task.public.requirements);
    assert.equal(report.schema, "krn.harness.compare.v2");
    assert.equal(report.task.environment.identity, task.environment.identity);
    assert.equal(report.lanes[1].results[0].axes.architecture.status, "pass");
    assert.equal(report.delta, undefined, "v2 must not manufacture a cross-axis aggregate");
  });
});

test("v2 comparison admits direct programmatic tasks before runner dispatch", async () => {
  await assert.rejects(
    compareHarness({
      task: validTask({ check: "candidate-visible-oracle" }),
      lanes: ["vanilla", "full"],
      runner: () => {
        throw new Error("runner must not receive an unadmitted v2 task");
      },
    }),
    /candidate-visible-check/,
  );
});

test("the legacy lane adapter refuses v2 until the isolated runner exists", () => {
  const adapter = path.resolve("scripts/harness/lane-runner.mjs");
  const result = spawnSync(process.execPath, [adapter], {
    cwd: path.resolve("."),
    encoding: "utf8",
    input: JSON.stringify({ task: validTask(), root: path.resolve(".") }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /v2-requires-isolated-runner/);
});
