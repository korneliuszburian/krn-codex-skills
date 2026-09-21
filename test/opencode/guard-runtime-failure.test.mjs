import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { dirname } from "node:path";
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

// A shim python3 on PATH lets the observer drive every guard failure mode
// without touching the real guard policy.
const withPythonShim = (script, run) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-guard-shim-"));
  const shim = join(dir, "python3");
  writeFileSync(shim, `#!/bin/sh\ncat >/dev/null\n${script}\n`);
  chmodSync(shim, 0o755);
  const original = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${original ?? ""}`;
  try {
    return run();
  } finally {
    process.env.PATH = original;
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a guard that cannot run fails closed instead of allowing the call", async () => {
  const plugin = await loadAdapter();
  assert.ok(plugin, "config/opencode/plugins/krn.js must load");
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);

  const denied = (script, label) => {
    const reason = withPythonShim(script, call);
    assert.ok(typeof reason === "string" && reason.length > 0, `${label} must deny the call, got ${JSON.stringify(reason)}`);
  };
  denied("exit 3", "a non-zero exit");
  denied("printf 'not json'", "malformed output");
  denied("sleep 6", "a timeout");

  const original = process.env.PATH;
  process.env.PATH = join(tmpdir(), "krn-guard-no-python-absent");
  try {
    const reason = call();
    assert.ok(typeof reason === "string" && reason.length > 0, `a spawn failure must deny the call, got ${JSON.stringify(reason)}`);
  } finally {
    process.env.PATH = original;
  }
});

test("a guard that runs and raises no objection allows the call", async () => {
  const plugin = await loadAdapter();
  assert.ok(plugin, "config/opencode/plugins/krn.js must load");
  const reason = withPythonShim("exit 0", () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root));
  assert.equal(reason, null, "a silent successful guard must allow the call");
});
