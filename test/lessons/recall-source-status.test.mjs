import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI = join(fileURLToPath(new URL("../..", import.meta.url)), "scripts", "krn.mjs");

function recall(root) {
  const result = spawnSync(process.execPath, [CLI, "memory", "recall", "--root", root, "--changed", "scripts/x.mjs", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
}

test("a repository without the lessons page reports not-adopted rather than zero hits", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-recall-source-"));
  try {
    const report = recall(root);
    assert.deepEqual(report.hits, []);
    assert.equal(report.source?.present, false, "a missing source must be named, not implied by zero hits");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lessons page with malformed rows reports them beside the hits", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-recall-source-"));
  try {
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| broken\n");
    const report = recall(root);
    assert.equal(report.source?.present, true);
    assert.ok(report.source?.malformed >= 1, `a malformed row must be counted: ${JSON.stringify(report.source)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
