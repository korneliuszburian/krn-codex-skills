import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const withDirAsync = async (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-opencode-"));
  try {
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const makeCapsule = (dir, id, outcome, next) => {
  const capsule = join(dir, ".krn", "runs", "delivery-loop", id);
  mkdirSync(capsule, { recursive: true });
  writeFileSync(
    join(capsule, "state.md"),
    [
      `Outcome state: ${outcome}`,
      `Next bounded owner and action: ${next}`,
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: run `npm test`",
      "",
    ].join("\n"),
  );
};

test("the adapter module exports the ported hooks", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  assert.equal(typeof adapter.KrnAdapter, "function");
  assert.equal(typeof adapter.capsuleBrief, "function");
  assert.equal(typeof adapter.adoptionSignal, "function");
  assert.equal(typeof adapter.guardReason, "function");
});

test("the adoption signal fires only for an unmanaged work tree with instructions", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  withDir((dir) => {
    assert.equal(adapter.adoptionSignal(dir), null, "a plain directory gets no signal");
    mkdirSync(join(dir, ".git"));
    assert.equal(adapter.adoptionSignal(dir), null, "a work tree without instructions gets no signal");
    writeFileSync(join(dir, "AGENTS.md"), "# Demo\n");
    assert.match(adapter.adoptionSignal(dir), /KRN onboarding/);
    writeFileSync(
      join(dir, "AGENTS.md"),
      "# Demo\n\n<!-- krn-agent-workflow:start -->\nmanaged\n<!-- krn-agent-workflow:end -->\n",
    );
    assert.equal(adapter.adoptionSignal(dir), null, "an adopted repository gets no signal");
  });
});

test("the capsule brief includes only continuing outcomes", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  withDir((dir) => {
    assert.equal(adapter.capsuleBrief(dir), null, "no capsule means no brief");
    makeCapsule(dir, "out-1", "ACTIVE", "finish the slice");
    makeCapsule(dir, "out-2", "COMPLETE", "do not continue");
    const brief = adapter.capsuleBrief(dir);
    assert.match(brief, /out-1/);
    assert.match(brief, /finish the slice/);
    assert.doesNotMatch(brief, /do not continue/);
  });
});

test("the guard delegates protected commands and paths to the shared policy", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  withDir((dir) => {
    assert.ok(adapter.guardReason("bash", { command: "rm -rf .env" }, dir), "a protected rm must be denied");
    assert.equal(adapter.guardReason("bash", { command: "ls -la" }, dir), null, "a read-only command stays allowed");
    assert.ok(adapter.guardReason("write", { filePath: join(dir, ".env"), content: "x" }, dir), "a write to .env must be denied");
    assert.equal(
      adapter.guardReason("write", { filePath: join(dir, "notes.md"), content: "x" }, dir),
      null,
      "an ordinary write stays allowed",
    );
  });
});

test("the hooks feed the system prompt, compaction, and block protected tools", async () => {
  const adapter = await loadAdapter();
  assert.ok(adapter, "config/opencode/plugins/krn.js must load");
  await withDirAsync(async (dir) => {
    makeCapsule(dir, "out-1", "ACTIVE", "finish the hook port");
    const hooks = await adapter.KrnAdapter({ directory: dir });
    const system = [];
    await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, { system });
    assert.equal(system.length, 1, "the system prompt receives the capsule brief");
    assert.match(system[0], /finish the hook port/);
    await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, { system });
    assert.equal(system.length, 1, "an already-injected system prompt is not duplicated");
    const context = [];
    await hooks["experimental.session.compacting"]({}, { context });
    assert.equal(context.length, 1, "compaction receives the capsule brief");
    assert.match(context[0], /finish the hook port/);
    await assert.rejects(
      hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "rm -rf .env" } }),
      /one concrete path|protected|denied|rm/i,
      "a protected tool call is blocked",
    );
  });
});
