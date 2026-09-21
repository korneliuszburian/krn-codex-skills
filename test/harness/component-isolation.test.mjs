import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

// The plugin adapter owns both the session brief and the destructive-command
// guard. A harness lane can ablate either component independently through
// KRN_DISABLE_BRIEF and KRN_DISABLE_GUARD, which the adapter reads at call time.
const pluginPath = fileURLToPath(new URL("../../config/opencode/plugins/krn.js", import.meta.url));

async function loadAdapter() {
  return import(pathToFileURL(pluginPath).href);
}

const withDir = async (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-component-isolation-"));
  try {
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// A shim python3 on PATH makes the guard deterministic: it always returns the
// same deny decision, so the observer never depends on the real guard policy.
const withPythonShim = async (script, run) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-component-shim-"));
  const shim = join(dir, "python3");
  writeFileSync(shim, `#!/bin/sh\ncat >/dev/null\n${script}\n`);
  chmodSync(shim, 0o755);
  const original = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${original ?? ""}`;
  try {
    return await run();
  } finally {
    process.env.PATH = original;
    rmSync(dir, { recursive: true, force: true });
  }
};

const DENY = '{"hookSpecificOutput":{"permissionDecisionReason":"denied by the shim"}}';

function makeCapsule(dir, id) {
  // The work-tree marker keeps the fixture's root deterministic when a stray
  // `.git` lives in an ancestor of the temp dir.
  mkdirSync(join(dir, ".git"), { recursive: true });
  const capsule = join(dir, ".krn", "runs", "delivery-loop", id);
  mkdirSync(capsule, { recursive: true });
  writeFileSync(
    join(capsule, "state.md"),
    [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: finish the ablation",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: run `npm test`",
      "",
    ].join("\n"),
  );
}

test("KRN_DISABLE_GUARD turns the destructive-command guard off and back on", async () => {
  const plugin = await loadAdapter();
  assert.ok(plugin, "config/opencode/plugins/krn.js must load");
  await withDir(async (dir) => {
    const hooks = await plugin.KrnAdapter({ directory: dir });
    const call = () => hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "rm -rf .env" } });
    await withPythonShim(`printf '%s' '${DENY}'`, async () => {
      const original = process.env.KRN_DISABLE_GUARD;
      try {
        process.env.KRN_DISABLE_GUARD = "1";
        await assert.doesNotReject(call(), "a lane without hooks must not run the guard");
        delete process.env.KRN_DISABLE_GUARD;
        await assert.rejects(call(), /denied by the shim/, "an unset flag must keep the guard active");
      } finally {
        if (original === undefined) delete process.env.KRN_DISABLE_GUARD;
        else process.env.KRN_DISABLE_GUARD = original;
      }
    });
  });
});

test("KRN_DISABLE_BRIEF turns the capsule brief off and back on", async () => {
  const plugin = await loadAdapter();
  assert.ok(plugin, "config/opencode/plugins/krn.js must load");
  await withDir(async (dir) => {
    makeCapsule(dir, "out-1");
    const hooks = await plugin.KrnAdapter({ directory: dir });
    const inject = async () => {
      const system = [];
      await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, { system });
      return system;
    };
    const original = process.env.KRN_DISABLE_BRIEF;
    try {
      process.env.KRN_DISABLE_BRIEF = "1";
      assert.deepEqual(await inject(), [], "a lane without brief must not inject the capsule");
      delete process.env.KRN_DISABLE_BRIEF;
      const system = await inject();
      assert.equal(system.length, 1, "an unset flag must inject the capsule brief");
      assert.match(system[0], /finish the ablation/);
    } finally {
      if (original === undefined) delete process.env.KRN_DISABLE_BRIEF;
      else process.env.KRN_DISABLE_BRIEF = original;
    }
  });
});
