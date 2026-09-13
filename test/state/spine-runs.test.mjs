import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { capsuleIds, runDirectories } from "../../scripts/lib/state/spine-runs.mjs";

test("runDirectories lists non-delivery runs and skips delivery-loop and files, never a hidden run", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-spine-runs-"));
  try {
    mkdirSync(join(root, ".krn", "runs", "slice-work", "run-1"), { recursive: true });
    mkdirSync(join(root, ".krn", "runs", "slice-work", "run-2"), { recursive: true });
    mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1"), { recursive: true });
    writeFileSync(join(root, ".krn", "runs", "slice-work", "notes.txt"), "x");
    mkdirSync(join(root, ".krn", "runs", ".cache", "run-1"), { recursive: true });
    assert.deepEqual(
      runDirectories(root).map((run) => run.pointer),
      [".krn/runs/.cache/run-1", ".krn/runs/slice-work/run-1", ".krn/runs/slice-work/run-2"],
    );
    assert.deepEqual(runDirectories(join(root, "missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runDirectories still lists a hidden run so it cannot hide from the orphan gate", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-spine-hiddenrun-"));
  try {
    mkdirSync(join(root, ".krn", "runs", "slice-work", ".hidden-run"), { recursive: true });
    mkdirSync(join(root, ".krn", "runs", ".cache", "run-1"), { recursive: true });
    assert.deepEqual(
      runDirectories(root).map((run) => run.pointer),
      [".krn/runs/.cache/run-1", ".krn/runs/slice-work/.hidden-run"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runDirectories includes a symlinked run so it cannot hide from the orphan gate", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-spine-symlink-"));
  try {
    mkdirSync(join(root, ".krn", "runs", "slice-work"), { recursive: true });
    const target = join(root, "real-run");
    mkdirSync(target);
    symlinkSync(target, join(root, ".krn", "runs", "slice-work", "run-link"));
    assert.deepEqual(
      runDirectories(root).map((run) => run.pointer),
      [".krn/runs/slice-work/run-link"],
    );

    const file = join(root, "not-a-dir");
    writeFileSync(file, "x");
    symlinkSync(file, join(root, ".krn", "runs", "wf-file"));
    assert.deepEqual(runDirectories(root).map((run) => run.pointer), [".krn/runs/slice-work/run-link"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("capsuleIds returns only delivery-loop directories holding a state.md", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-capsule-ids-"));
  try {
    mkdirSync(join(root, ".krn", "runs", "delivery-loop", "with-state"), { recursive: true });
    writeFileSync(join(root, ".krn", "runs", "delivery-loop", "with-state", "state.md"), "x");
    mkdirSync(join(root, ".krn", "runs", "delivery-loop", "empty"), { recursive: true });
    assert.deepEqual(capsuleIds(root), ["with-state"]);
    assert.deepEqual(capsuleIds(join(root, "missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("capsuleIds follows a symlinked capsule directory", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-capsule-symlink-"));
  try {
    mkdirSync(join(root, ".krn", "runs", "delivery-loop"), { recursive: true });
    const target = join(root, "real-capsule");
    mkdirSync(target);
    writeFileSync(join(target, "state.md"), "x");
    symlinkSync(target, join(root, ".krn", "runs", "delivery-loop", "linked"));
    assert.deepEqual(capsuleIds(root), ["linked"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
