import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runProcess } from "../../scripts/lib/kernel/proc.mjs";

const loadGenerator = async () => {
  try {
    return await import("../../scripts/harness/memory-tasks.mjs");
  } catch {
    return null;
  }
};

const ROWS = [{ context: "Session one: the user keeps three items at the cleaner.", question: "How many items?", answer: "3" }];

test("the generator emits a runnable task per row", async () => {
  const generator = await loadGenerator();
  assert.ok(generator, "scripts/harness/memory-tasks.mjs must exist");
  const out = mkdtempSync(path.join(tmpdir(), "krn-memory-tasks-"));
  try {
    const written = generator.writeTasks({ rows: ROWS, out, prefix: "lme" });
    assert.deepEqual(written, ["lme-0"]);
    const dir = path.join(out, "lme-0");
    assert.ok(existsSync(path.join(dir, "task.md")));
    for (const name of ["context.md", "question.txt", "gold.txt", "check.mjs"]) {
      assert.ok(existsSync(path.join(dir, "workspace", name)), `${name} must be written`);
    }
    assert.match(readFileSync(path.join(dir, "task.md"), "utf8"), /"id": "lme-0"/);

    const workspace = path.join(dir, "workspace");
    writeFileSync(path.join(workspace, "answers.json"), JSON.stringify(["I need to pick up 3 items"]));
    assert.equal(runProcess("node", ["check.mjs"], { cwd: workspace }).ok, true, "a containing answer must pass");
    writeFileSync(path.join(workspace, "answers.json"), JSON.stringify(["four"]));
    assert.equal(runProcess("node", ["check.mjs"], { cwd: workspace }).ok, false, "a wrong answer must fail");
    writeFileSync(path.join(workspace, "answers.json"), JSON.stringify([""]));
    assert.equal(runProcess("node", ["check.mjs"], { cwd: workspace }).ok, false, "an empty answer must fail");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the generator refuses a missing rows file", () => {
  const out = mkdtempSync(path.join(tmpdir(), "krn-memory-tasks-missing-"));
  try {
    const result = spawnSync(process.execPath, ["scripts/harness/memory-tasks.mjs", "--rows", "/nonexistent.json", "--out", path.join(out, "none")], {
      encoding: "utf8",
      cwd: path.resolve(new URL("../..", import.meta.url).pathname),
    });
    assert.notEqual(result.status, 0, "a missing rows file must refuse");
    assert.match(result.stderr, /nonexistent\.json/, "the refusal must name the missing rows file");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
