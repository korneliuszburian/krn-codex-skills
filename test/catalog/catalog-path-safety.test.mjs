import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  requireDirectoryWithoutSymlinks,
  requireRegularFileWithoutSymlinks,
} from "../../scripts/lib/catalog/catalog-path-safety.mjs";

const withRoot = async (body) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-path-safety-")));
  try {
    await body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("accepts a real directory and a real file", async () => {
  await withRoot(async (root) => {
    const directory = path.join(root, "dir");
    mkdirSync(directory);
    const file = path.join(root, "file.txt");
    writeFileSync(file, "x");
    assert.equal(await requireDirectoryWithoutSymlinks(directory, { label: "dir" }), true);
    assert.equal(await requireRegularFileWithoutSymlinks(file, { label: "file" }), true);
  });
});

test("rejects wrong types with CATALOG_PATH_WRONG_TYPE", async () => {
  await withRoot(async (root) => {
    const file = path.join(root, "file.txt");
    writeFileSync(file, "x");
    await assert.rejects(
      requireDirectoryWithoutSymlinks(file, { label: "dir" }),
      (error) => error.code === "CATALOG_PATH_WRONG_TYPE" && /must be a directory/.test(error.message),
    );
    await assert.rejects(
      requireRegularFileWithoutSymlinks(root, { label: "file" }),
      (error) => error.code === "CATALOG_PATH_WRONG_TYPE" && /must be a regular file/.test(error.message),
    );
  });
});

test("handles missing paths with and without allowMissing", async () => {
  await withRoot(async (root) => {
    const missing = path.join(root, "nope");
    await assert.rejects(
      requireDirectoryWithoutSymlinks(missing, { label: "dir" }),
      (error) => error.code === "CATALOG_PATH_MISSING" && /does not exist/.test(error.message),
    );
    assert.equal(await requireDirectoryWithoutSymlinks(missing, { label: "dir", allowMissing: true }), false);
  });
});

test("rejects a symlinked leaf or parent with CATALOG_PATH_SYMLINK", async () => {
  await withRoot(async (root) => {
    const real = path.join(root, "real");
    mkdirSync(real);
    const link = path.join(root, "link");
    symlinkSync(real, link);
    await assert.rejects(
      requireDirectoryWithoutSymlinks(link, { label: "dir" }),
      (error) => error.code === "CATALOG_PATH_SYMLINK",
    );
    await assert.rejects(
      requireDirectoryWithoutSymlinks(path.join(link, "child"), { label: "dir" }),
      (error) => error.code === "CATALOG_PATH_SYMLINK",
    );
  });
});

test("covers the file helper's missing, allowMissing, and symlink behavior", async () => {
  await withRoot(async (root) => {
    const missing = path.join(root, "nope.txt");
    await assert.rejects(
      requireRegularFileWithoutSymlinks(missing, { label: "file" }),
      (error) => error.code === "CATALOG_PATH_MISSING",
    );
    assert.equal(
      await requireRegularFileWithoutSymlinks(missing, { label: "file", allowMissing: true }),
      false,
    );

    const target = path.join(root, "target.txt");
    writeFileSync(target, "x");
    const link = path.join(root, "linked.txt");
    symlinkSync(target, link);
    await assert.rejects(
      requireRegularFileWithoutSymlinks(link, { label: "file" }),
      (error) => error.code === "CATALOG_PATH_SYMLINK",
    );

    const seen = [];
    assert.equal(
      await requireRegularFileWithoutSymlinks(target, {
        label: "file",
        beforeAccess: (candidate) => seen.push(candidate),
      }),
      true,
    );
    assert.ok(seen.includes(path.resolve(target)));
  });
});

test("runs beforeAccess for the candidate and each component and honors its throw", async () => {
  await withRoot(async (root) => {
    const directory = path.join(root, "a", "b");
    mkdirSync(directory, { recursive: true });
    const seen = [];
    assert.equal(
      await requireDirectoryWithoutSymlinks(directory, {
        label: "dir",
        beforeAccess: (candidate) => seen.push(candidate),
      }),
      true,
    );
    assert.equal(seen[0], path.resolve(directory));
    assert.ok(seen.includes(path.join(root, "a")));
    assert.ok(seen.includes(directory));

    await assert.rejects(
      requireDirectoryWithoutSymlinks(directory, {
        label: "dir",
        beforeAccess: () => {
          throw new Error("blocked");
        },
      }),
      /blocked/,
    );
  });
});
