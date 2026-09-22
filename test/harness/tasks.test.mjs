import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadTask } from "../../scripts/lib/harness/e2e-compare.mjs";
import { runProcess } from "../../scripts/lib/kernel/proc.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const TASKS = path.join(root, "test", "harness", "tasks");
const EXPECTED = ["fail-closed", "single-owner", "slugify"];

const taskIds = () => {
  try {
    return readdirSync(TASKS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const withWorkspace = (taskId, run) => {
  const task = loadTask(path.join(TASKS, taskId, "task.md"));
  const workspace = mkdtempSync(path.join(tmpdir(), `krn-task-${taskId}-`));
  try {
    cpSync(path.join(root, task.workspace), workspace, { recursive: true });
    const first = runProcess("sh", ["-c", task.check], { cwd: workspace });
    const before = first.ok;
    cpSync(path.join(TASKS, taskId, "solution"), workspace, { recursive: true });
    const after = runProcess("sh", ["-c", task.check], { cwd: workspace }).ok;
    return run({ task, before, after });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
};

test("the task-set observer is wired into the library gate", () => {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:lib"] ?? "", /test\/harness\/tasks\.test\.mjs/, "the task-set observer must run in test:lib");
});

test("the held-out task set is present and complete", () => {
  assert.deepEqual(taskIds(), EXPECTED, "the task set must carry the three held-out tasks");
});

test("every task check is red before the solution and green after", () => {
  for (const taskId of taskIds()) {
    withWorkspace(taskId, ({ task, before, after }) => {
      assert.equal(before, false, `${task.id}: the deciding check must be red on the initial workspace`);
      assert.equal(after, true, `${task.id}: the deciding check must be green on the solved workspace`);
    });
  }
});
