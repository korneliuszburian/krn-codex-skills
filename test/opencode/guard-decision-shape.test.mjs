import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginPath = join(root, "config", "opencode", "plugins", "krn.js");

async function loadAdapter() {
  try {
    return await import(pathToFileURL(pluginPath).href);
  } catch {
    return null;
  }
}

// A shim python3 on PATH emits a chosen stdout, so the observer drives the
// decision-shape boundary without touching the real guard policy.
const withPythonShim = (script, run) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-guard-shape-"));
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

const emit = (json) => `printf '%s' '${json}'`;

const denial = (output) => JSON.stringify({ hookSpecificOutput: output });

test("the plugin exposes the guard decision boundary", async () => {
  const plugin = await loadAdapter();
  assert.ok(plugin, "config/opencode/plugins/krn.js must load");
  assert.equal(typeof plugin.guardReason, "function");
});

test("a parseable but shapeless decision refuses the call", async () => {
  const plugin = await loadAdapter();
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);

  for (const payload of ["{}", "[]", '"deny"', "null", denial({})]) {
    const reason = withPythonShim(emit(payload), call);
    assert.ok(typeof reason === "string" && reason.length > 0, `${payload} must refuse the call, got ${JSON.stringify(reason)}`);
    assert.match(reason, /malformed decision/, `${payload} must report a malformed decision, got ${JSON.stringify(reason)}`);
  }
});

test("an unknown permission decision refuses the call", async () => {
  const plugin = await loadAdapter();
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);
  const reason = withPythonShim(emit(denial({ permissionDecision: "ask" })), call);
  assert.ok(typeof reason === "string" && reason.length > 0, `an unknown decision must refuse the call, got ${JSON.stringify(reason)}`);
  assert.match(reason, /malformed decision/);
});

test("a denial without explanatory text refuses the call", async () => {
  const plugin = await loadAdapter();
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);

  for (const payload of [denial({ permissionDecision: "deny" }), denial({ permissionDecision: "deny", permissionDecisionReason: "   " })]) {
    const reason = withPythonShim(emit(payload), call);
    assert.ok(typeof reason === "string" && reason.length > 0, `${payload} must refuse the call, got ${JSON.stringify(reason)}`);
    assert.match(reason, /without an explanation/, `${payload} must report an unexplained denial, got ${JSON.stringify(reason)}`);
  }
});

test("a denial with explanatory text refuses the call with that text", async () => {
  const plugin = await loadAdapter();
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);
  const reason = withPythonShim(emit(denial({ permissionDecision: "deny", permissionDecisionReason: "blocked by the test policy" })), call);
  assert.equal(reason, "blocked by the test policy");
});

test("a successful empty output and an explicit allow both allow the call", async () => {
  const plugin = await loadAdapter();
  const call = () => plugin.guardReason("bash", { command: "rm -rf /tmp/krn-guard-probe" }, root);

  const silent = withPythonShim("exit 0", call);
  assert.equal(silent, null, "a silent successful guard must allow the call");

  const allowed = withPythonShim(emit(denial({ permissionDecision: "allow" })), call);
  assert.equal(allowed, null, "an explicit allow decision must allow the call");
});
