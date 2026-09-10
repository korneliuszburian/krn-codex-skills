import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { classifyTarget, declaredRuntimePaths } from "../scripts/lib/install-release.mjs";

test("declaredRuntimePaths requires and sorts the manifest field", () => {
  assert.deepEqual(declaredRuntimePaths({ runtime_paths: ["b", "a"] }), ["a", "b"]);
  assert.throws(() => declaredRuntimePaths({}), /missing runtime_paths/);
  assert.throws(() => declaredRuntimePaths({ runtime_paths: [] }), /missing runtime_paths/);
});

test("classifyTarget recognizes legacy source, foreign, and other-release links", () => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-classify-")));
  const source = join(base, "source");
  const relative = "skills/engineering/x";
  mkdirSync(join(source, relative), { recursive: true });
  const sourceFile = join(source, relative, "SKILL.md");
  writeFileSync(sourceFile, "x");
  const releaseRoot = join(base, "codex", "krn");
  const release = join(releaseRoot, "releases", "deadbeef");
  mkdirSync(join(release, relative), { recursive: true });
  const plan = { source: fs.realpathSync(source), releaseRoot, current: join(releaseRoot, "current"), release };
  const item = { label: "skill__x", target: join(base, "link"), relative };

  assert.equal(classifyTarget(plan, item, fs.realpathSync(join(source, relative))), "legacy_source");
  assert.equal(classifyTarget(plan, item, fs.realpathSync(join(release, relative))), "other_release");
  const foreign = join(base, "foreign.txt");
  writeFileSync(foreign, "y");
  assert.equal(classifyTarget(plan, item, fs.realpathSync(foreign)), "foreign");
  rmSync(base, { recursive: true, force: true });
});
