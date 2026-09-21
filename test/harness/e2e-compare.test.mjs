import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const loadHarness = async () => {
  try {
    return await import("../../scripts/lib/harness/e2e-compare.mjs");
  } catch {
    return null;
  }
};

const root = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(root, "scripts", "krn.mjs");

const withTemp = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-harness-compare-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const taskSource = (payload) => `# Harness task\n\n\`\`\`krn-harness-task\n${JSON.stringify(payload)}\n\`\`\`\n`;

test("the comparison runner loads and exposes its contract", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  assert.equal(typeof harness.compareHarness, "function");
  assert.equal(typeof harness.loadTask, "function");
});

test("loadTask reads a fenced task block and a check-less task is refused", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  await withTemp(async (dir) => {
    const file = join(dir, "task.md");
    writeFileSync(file, taskSource({ id: "widget", prompt: "Fix the widget", check: "node --test test/widget.test.mjs" }));
    const task = harness.loadTask(file);
    assert.equal(task.id, "widget");
    assert.equal(task.prompt, "Fix the widget");
    assert.equal(task.check, "node --test test/widget.test.mjs");
    await assert.rejects(
      () => harness.compareHarness({ task: { prompt: "no check" }, lanes: ["vanilla", "full"], runs: 1, runner: () => ({}) }),
      /missing-deciding-check/,
    );
  });
});

test("two identical lanes report a zero delta and the no-detectable-delta note", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  await withTemp(async (dir) => {
    const runner = ({ enabled }) => ({ pass: enabled.hooks, tokens: 5, wallSeconds: 0.25 });
    const report = await harness.compareHarness({
      task: { id: "control", check: "node --test test/widget.test.mjs" },
      lanes: [
        { name: "vanilla", enabled: { skills: true, hooks: true } },
        { name: "full", enabled: { skills: true, hooks: true } },
      ],
      runs: 3,
      runner,
      root: dir,
    });
    assert.equal(report.note, "no-detectable-delta");
    assert.deepEqual(report.delta.full, { passRate: 0, tokens: 0, wallSeconds: 0 });
    assert.equal(report.lanes.length, 2);
    assert.equal(report.lanes[0].runs, 3);
  });
});

test("disabling a named capability in one lane produces a detectable delta", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  await withTemp(async (dir) => {
    const runner = ({ enabled }) => ({ pass: enabled.hooks === true, tokens: enabled.hooks ? 10 : 1, wallSeconds: enabled.hooks ? 1 : 0.1 });
    const report = await harness.compareHarness({
      task: { id: "mutant", check: "node --test test/widget.test.mjs", mutation: { lane: "full", kind: "hook", name: "destructive-guard" } },
      lanes: [
        { name: "vanilla", enabled: { skills: true, hooks: true } },
        { name: "full", enabled: { skills: true, hooks: true } },
      ],
      runs: 2,
      runner,
      root: dir,
    });
    assert.equal(report.note, "detectable-delta");
    assert.deepEqual(report.mutations, [{ lane: "full", kind: "hook", name: "destructive-guard", capability: "hooks" }]);
    assert.ok(report.delta.full.passRate < 0, "the mutated lane must lose pass rate");
    assert.ok(report.delta.full.tokens < 0, "the mutated lane must spend fewer tokens");
  });
});

test("a single lane is refused with a named rule", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  const runner = () => ({ pass: true, tokens: 0, wallSeconds: 0 });
  await assert.rejects(
    () => harness.compareHarness({ task: { check: "node --test test/widget.test.mjs" }, lanes: ["vanilla"], runs: 1, runner }),
    /too-few-lanes/,
  );
});

test("compareHarness writes result.json and a one-line summary under .krn/runs/eval", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  await withTemp(async (dir) => {
    const report = await harness.compareHarness({
      task: { id: "persist", check: "node --test test/widget.test.mjs" },
      lanes: ["vanilla", "full"],
      runs: 1,
      runner: ({ enabled }) => ({ pass: enabled.hooks, tokens: enabled.hooks ? 3 : 0, wallSeconds: 0.5 }),
      root: dir,
    });
    const evalRoot = join(dir, ".krn", "runs", "eval");
    const runs = readdirSync(evalRoot);
    assert.equal(runs.length, 1);
    assert.equal(report.run, `.krn/runs/eval/${runs[0]}`);
    const result = JSON.parse(readFileSync(join(evalRoot, runs[0], "result.json"), "utf8"));
    assert.equal(result.lanes.length, 2);
    assert.equal(result.note, "detectable-delta");
    const summary = readFileSync(join(evalRoot, runs[0], "summary.txt"), "utf8").trimEnd();
    assert.equal(summary.split("\n").length, 1);
    assert.match(summary, /^harness compare /);
  });
});

test("the CLI prints the comparison summary and exits 0 on a fixture", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "scripts/lib/harness/e2e-compare.mjs must exist");
  await withTemp(async (dir) => {
    const task = join(dir, "task.md");
    writeFileSync(task, taskSource({ id: "cli", prompt: "Run the fixture", check: "node --test test/widget.test.mjs" }));
    const stub = join(dir, "lane-stub.mjs");
    writeFileSync(stub, [
      'import { readFileSync } from "node:fs";',
      'const payload = JSON.parse(readFileSync(0, "utf8"));',
      "const enabled = Object.values(payload.enabled).filter(Boolean).length;",
      'process.stdout.write(JSON.stringify({ pass: enabled >= 3, tokens: enabled * 10, wallSeconds: enabled * 0.1 }) + "\\n");',
      "",
    ].join("\n"));
    const result = spawnSync(
      process.execPath,
      [cli, "harness", "compare", "--task", task, "--lanes", "vanilla,full", "--runs", "2"],
      { cwd: dir, encoding: "utf8", env: { ...process.env, KRN_HARNESS_LANE_RUNNER: stub } },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^harness compare /);
    assert.match(result.stdout, /detectable-delta/);
    const evalRoot = join(dir, ".krn", "runs", "eval");
    assert.ok(existsSync(evalRoot));
    assert.equal(readdirSync(evalRoot).length, 1);
  });
});

test("the ablation lanes disable exactly one surface from the full lane", async () => {
  const harness = await loadHarness();
  assert.ok(harness, "the harness must load");
  const seen = new Map();
  const runner = ({ lane, enabled }) => {
    seen.set(lane, enabled);
    return { pass: true, tokens: 1, wallSeconds: 1 };
  };
  const report = await harness.compareHarness({
    task: { id: "ablation", check: "node --test test/widget.test.mjs" },
    lanes: ["full", "no-skills", "no-brief", "no-hooks"],
    runs: 1,
    runner,
  });
  assert.equal(report.lanes.length, 4);
  assert.deepEqual(seen.get("full"), { skills: true, brief: true, hooks: true });
  assert.deepEqual(seen.get("no-skills"), { skills: false, brief: true, hooks: true });
  assert.deepEqual(seen.get("no-brief"), { skills: true, brief: false, hooks: true });
  assert.deepEqual(seen.get("no-hooks"), { skills: true, brief: true, hooks: false });
});
