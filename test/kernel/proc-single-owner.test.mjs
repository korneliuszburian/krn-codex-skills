import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// The owner is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when the owner does not exist yet.
const loadProc = async () => {
  try {
    return await import("../../scripts/lib/kernel/proc.mjs");
  } catch {
    return null;
  }
};

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js)$/.test(relative))
    .filter((relative) => relative.startsWith("scripts/"))
    .sort();
}

const SYNC_SPAWN_IMPORT = /import\s*\{[^}]*\b(?:spawnSync|execFileSync|execSync)\b[^}]*\}\s*from\s*"node:child_process"/;

export function syncSpawnImporters(entries) {
  return entries.filter(([, text]) => SYNC_SPAWN_IMPORT.test(text)).map(([relative]) => relative).sort();
}

test("synchronous child-process execution has exactly one kernel owner", () => {
  const entries = trackedSources().map((relative) => [relative, read(relative)]);
  assert.deepEqual(syncSpawnImporters(entries), ["scripts/lib/kernel/proc.mjs"], "only the kernel proc owner may import a synchronous spawn");
});

test("the owner normalizes status, output, and the spawn error", async () => {
  const proc = await loadProc();
  assert.ok(proc, "scripts/lib/kernel/proc.mjs must exist");
  const green = proc.runProcess(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.equal(green.ok, true);
  assert.equal(green.out, "ok");
  assert.equal(green.status, 0);
  const red = proc.runProcess(process.execPath, ["-e", "process.stderr.write('bad'); process.exit(3)"]);
  assert.equal(red.ok, false);
  assert.equal(red.status, 3);
  assert.equal(red.err, "bad");
  const missing = proc.runProcess("krn-no-such-command-xyz", []);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, null);
  assert.equal(missing.errorCode, "ENOENT");
});

test("the observer rejects a source that imports a sync spawn directly", () => {
  assert.deepEqual(syncSpawnImporters([["scripts/x.mjs", 'import { spawnSync } from "node:child_process";']]), ["scripts/x.mjs"]);
  assert.deepEqual(syncSpawnImporters([["scripts/y.mjs", 'import { execFile, spawn } from "node:child_process";']]), []);
});

test("the entrypoint shims delegate through the owner", () => {
  for (const entry of ["scripts/krn.mjs", "scripts/krn-codex-catalog.mjs"]) {
    assert.ok(read(entry).includes("spawnInherit("), `${entry} must delegate through the kernel proc owner`);
  }
});
