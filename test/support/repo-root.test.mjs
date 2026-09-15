import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveRepositoryRoot } from "../../scripts/lib/support/repo-root.mjs";

test("resolveRepositoryRoot returns a controlled error for malformed inputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-root-"));
  try {
    symlinkSync("loop", join(dir, "loop"));
    assert.throws(() => resolveRepositoryRoot(join(dir, "loop")), /repository path does not exist/);
    assert.throws(() => resolveRepositoryRoot("a\u0000b"), /repository path does not exist/);
    assert.throws(() => resolveRepositoryRoot(join(dir, "missing")), /repository path does not exist/);

    const file = join(dir, "file");
    writeFileSync(file, "");
    assert.throws(() => resolveRepositoryRoot(file, { label: "state" }), /expects a repository directory, got a file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRepositoryRoot returns a directory root without git", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-root-"));
  try {
    mkdirSync(join(dir, "repo"));
    const result = resolveRepositoryRoot(join(dir, "repo"));
    assert.equal(result.root, join(dir, "repo"));
    assert.equal(typeof result.hasGit, "boolean");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
