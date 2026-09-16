import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginPath = join(root, "config", "opencode", "plugins", "krn.js");

async function loadAdapter() {
  try {
    return await import(pathToFileURL(pluginPath).href);
  } catch {
    return null;
  }
}

const withDir = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-opencode-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a write-capable call that cannot be mapped to a guarded target is blocked", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  withDir((dir) => {
    assert.ok(
      adapter.guardReason("write", { content: "x" }, dir),
      "a write without filePath must be blocked",
    );
    assert.ok(
      adapter.guardReason("edit", { oldString: "a", newString: "b" }, dir),
      "an edit without filePath must be blocked",
    );
    assert.ok(
      adapter.guardReason("patch", { patchText: "not a recognizable patch" }, dir),
      "a patch with neither parseable patch text nor a path must be blocked",
    );
    assert.ok(
      adapter.guardReason("patch", {}, dir),
      "a patch with no patch text and no path must be blocked",
    );
  });
});

test("an ordinary write with a path stays allowed", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  withDir((dir) => {
    assert.equal(
      adapter.guardReason("write", { filePath: join(dir, "notes.md"), content: "x" }, dir),
      null,
      "an ordinary write with a concrete path stays allowed",
    );
  });
});
