import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A release digest is a committed trust anchor, so it must not depend on the
// host locale, the host path module, or the umask of the tar extraction that
// materialized the release. The observer imports the module dynamically and
// reaches through the namespace, so anything the base lacks surfaces as an
// in-case assertion failure rather than a module-resolution error.
const loadInspect = async () => (await import("../../scripts/lib/install/install-inspect.mjs")) ?? {};

const withTree = (body) => {
  const root = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), "krn-digest-portability-")));
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

test("digestTree orders sibling files bytewise rather than by locale", async () => {
  const inspect = await loadInspect();
  const digestTree = inspect.digestTree;
  assert.equal(typeof digestTree, "function", "install-inspect must export digestTree");
  withTree((root) => {
    writeFileSync(path.join(root, "B.txt"), "uppercase\n");
    writeFileSync(path.join(root, "a.txt"), "lowercase\n");
    const { files } = digestTree(root);
    assert.deepEqual(files, ["B.txt", "a.txt"], "bytewise order puts B.txt before a.txt; locale order does not");
  });
});

test("digest keys are normalized to POSIX separators before comparison and hashing", async () => {
  const inspect = await loadInspect();
  const normalize = inspect.digestKey;
  assert.equal(typeof normalize, "function", "install-inspect must export a digest key normalizer");
  assert.equal(normalize(path.win32.join("a", "b")), "a/b", "a Windows-separator key must normalize to a/b");
  assert.equal(normalize("a/b"), "a/b");
  assert.equal(normalize(""), "");
});
