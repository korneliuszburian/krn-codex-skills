import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { trackedEmDashErrors } from "../../scripts/lib/rules/tracked-text.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-tracked-text-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return root;
}

function track(root, name, content) {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
  const result = spawnSync("git", ["-C", root, "add", "--", name], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("tracked UTF-8 text flags every offending line, including paths with spaces and newlines", (t) => {
  const root = repo(t);
  track(root, "with space\nand line.md", `first\u2014second\u2014third\nclean\nlast\u2014line`);
  fs.writeFileSync(path.join(root, "untracked.md"), "untracked\u2014text");
  assert.deepEqual(trackedEmDashErrors(root), [
    '"with space\\nand line.md":1: 2 U+2014 EM DASH occurrence(s)',
    '"with space\\nand line.md":3: 1 U+2014 EM DASH occurrence(s)',
  ]);
});

test("tracked binary content is ignored, but tracked symlink target text is checked without following it", (t) => {
  const root = repo(t);
  track(root, "binary.data", Buffer.from([0, 0xe2, 0x80, 0x94]));
  fs.symlinkSync("outside\u2014target", path.join(root, "link"));
  const added = spawnSync("git", ["-C", root, "add", "link"], { encoding: "utf8" });
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(trackedEmDashErrors(root), ['"link":1: 1 U+2014 EM DASH occurrence(s)']);
});

test("the staged blob cannot hide behind a clean unstaged worktree edit", (t) => {
  const root = repo(t);
  track(root, "staged.md", "staged\u2014bad");
  fs.writeFileSync(path.join(root, "staged.md"), "worktree clean");
  assert.match(trackedEmDashErrors(root).join("\n"), /staged\.md.*U\+2014 EM DASH/);
});

test("symlinked parent directories refuse inspection outside the worktree", (t) => {
  const root = repo(t);
  track(root, "nested/file.md", "clean");
  fs.renameSync(path.join(root, "nested"), path.join(root, "held"));
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "krn-foreign-text-"));
  t.after(() => fs.rmSync(foreign, { recursive: true, force: true }));
  fs.writeFileSync(path.join(foreign, "file.md"), "also clean");
  fs.symlinkSync(foreign, path.join(root, "nested"));
  assert.match(trackedEmDashErrors(root).join("\n"), /symlinked parent/);
});

test("BOM-marked UTF-16 tracked text is still Unicode text", (t) => {
  const root = repo(t);
  track(root, "utf16.txt", Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x14, 0x20]));
  assert.match(trackedEmDashErrors(root).join("\n"), /utf16\.txt.*U\+2014 EM DASH/);
});

test("unreadable tracked paths and missing Git inventory fail closed", (t) => {
  const root = repo(t);
  track(root, "missing.md", "okay");
  fs.unlinkSync(path.join(root, "missing.md"));
  assert.deepEqual(trackedEmDashErrors(root), ['"missing.md": tracked path cannot be read']);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "krn-not-repo-"));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  assert.match(trackedEmDashErrors(other)[0], /cannot list tracked text paths/);
});

test("the tracked KRN text corpus has no U+2014", () => {
  assert.deepEqual(trackedEmDashErrors(ROOT), []);
});
