import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CLI = path.join(root, "scripts", "krn.mjs");

// A frozen run applies the base case list through the candidate runner. A case
// the candidate manifest no longer declares is a deliberate surface removal, so
// it is dropped and reported, not failed.
test("a frozen run drops a case the candidate manifest no longer declares", () => {
  const base = mkdtempSync(path.join(tmpdir(), "krn-frozen-drop-"));
  try {
    mkdirSync(path.join(base, "config"), { recursive: true });
    const manifest = {
      version: 1,
      program: "scripts/krn.mjs",
      cases: [
        { id: "removed-surface-a", steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
        { id: "removed-surface-b", steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
      ],
    };
    writeFileSync(path.join(base, "config", "conformance.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [CLI, "conformance", "check", "--root", base, "--candidate", root, "--frozen"], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    for (const id of ["removed-surface-a", "removed-surface-b"]) {
      assert.match(result.stdout, new RegExp(`ok ${id} - dropped`), `the removed case ${id} must be reported as dropped`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
