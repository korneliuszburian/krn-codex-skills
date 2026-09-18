import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(root, "config", "opencode", "plugins", "krn.js");
const hook = join(root, "scripts", "hooks", "krn_memory.py");
const MANAGED_BLOCK = "<!-- krn-agent-workflow:start -->\nmanaged\n<!-- krn-agent-workflow:end -->\n";
const CLAIM_COMMAND = /krn ticket claim --root \. --id <id>/;

const withDir = async (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-queue-"));
  try {
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeInstructions = (dir, { managed = true } = {}) => {
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), managed ? `# Demo\n${MANAGED_BLOCK}` : "# Demo\n");
};

const makeTicket = (dir, id, status, blockedBy = "none", sub = ".scratch") => {
  const file = join(dir, sub, `${id}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    [
      "<krn-ticket>",
      `Id: ${id}`,
      `Title: ${id}`,
      `Status: ${status}`,
      "Type: task",
      "Repository-base: main",
      "Scope: scripts/hooks/krn_memory.py",
      "Deciding check: true",
      "Contract: test/hooks-queue-brief.test.mjs:red->green",
      "Acceptance: the queue is named",
      `Blocked by: ${blockedBy}`,
      "</krn-ticket>",
      "",
    ].join("\n"),
  );
};

const makeCapsule = (dir, id, outcome) => {
  const capsule = join(dir, ".krn", "runs", "delivery-loop", id);
  mkdirSync(capsule, { recursive: true });
  writeFileSync(
    join(capsule, "state.md"),
    [
      `Outcome state: ${outcome}`,
      "Next bounded owner and action: finish the capsule slice",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: run `npm test`",
      "",
    ].join("\n"),
  );
};

const hookContext = (dir, event = "SessionStart") => {
  const result = spawnSync("python3", ["-B", hook], {
    input: JSON.stringify({ hook_event_name: event, cwd: dir }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, event);
  return output.additionalContext;
};

test("the plugin exports the queue brief", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  assert.equal(typeof adapter.queueBrief, "function");
  assert.equal(typeof adapter.readyIds, "function");
});

test("the plugin names the three smallest ready ids and the claim command on one line", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withDir(async (dir) => {
    writeInstructions(dir);
    for (let index = 1; index <= 12; index += 1) makeTicket(dir, `sh-${String(index).padStart(2, "0")}`, "ready");
    const brief = adapter.queueBrief(dir);
    assert.equal(typeof brief, "string");
    assert.equal(brief.split("\n").length, 1, "the brief is exactly one line");
    assert.match(brief, /KRN ready queue/);
    assert.match(brief, /sh-01, sh-02, sh-03/);
    assert.doesNotMatch(brief, /sh-04/);
    assert.match(brief, CLAIM_COMMAND);
  });
});

test("the plugin names only the frontier, resolving Blocked by against done ids", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withDir(async (dir) => {
    writeInstructions(dir);
    makeTicket(dir, "t-done", "done");
    makeTicket(dir, "t-next", "ready", "t-done");
    makeTicket(dir, "t-wait", "ready", "t-other");
    makeTicket(dir, "t-other", "ready");
    makeTicket(dir, "t-tickets", "ready", "none", ".krn/tickets");
    const brief = adapter.queueBrief(dir);
    assert.match(brief, /t-next/);
    assert.match(brief, /t-other/);
    assert.match(brief, /t-tickets/);
    assert.doesNotMatch(brief, /t-wait/);
  });
});

test("the plugin stays silent with a continuing capsule, an empty queue, or no managed block", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withDir(async (dir) => {
    writeInstructions(dir);
    makeTicket(dir, "sh-01", "ready");
    assert.match(adapter.queueBrief(dir), /KRN ready queue/);
    makeCapsule(dir, "out-1", "ACTIVE");
    assert.equal(adapter.queueBrief(dir), null, "a continuing capsule suppresses the queue brief");
  });
  await withDir(async (dir) => {
    writeInstructions(dir);
    assert.equal(adapter.queueBrief(dir), null, "an empty queue emits nothing");
  });
  await withDir(async (dir) => {
    writeInstructions(dir, { managed: false });
    makeTicket(dir, "sh-01", "ready");
    assert.equal(adapter.queueBrief(dir), null, "an unmanaged tree emits no queue brief");
    assert.match(adapter.adoptionSignal(dir), /KRN onboarding/);
  });
});

test("the adapter injects the ready queue and keeps compaction silent", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withDir(async (dir) => {
    writeInstructions(dir);
    makeTicket(dir, "sh-07", "ready");
    const hooks = await adapter.KrnAdapter({ directory: dir });
    const system = [];
    await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, { system });
    assert.equal(system.length, 1, "the system prompt receives the queue brief");
    assert.match(system[0], /KRN ready queue/);
    assert.match(system[0], /sh-07/);
    assert.doesNotMatch(system[0], /KRN onboarding/);
    await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, { system });
    assert.equal(system.length, 1, "an already-injected system prompt is not duplicated");
    const context = [];
    await hooks["experimental.session.compacting"]({}, { context });
    assert.equal(context.length, 0, "compaction never emits the ready queue");
  });
});

test("the SessionStart hook emits the ready-frontier line in a managed repo", async () => {
  await withDir(async (dir) => {
    writeInstructions(dir);
    for (let index = 1; index <= 12; index += 1) makeTicket(dir, `sh-${String(index).padStart(2, "0")}`, "ready");
    const context = hookContext(dir, "SessionStart");
    assert.equal(typeof context, "string");
    assert.equal(context.split("\n").length, 1, "the brief is exactly one line");
    assert.match(context, /KRN ready queue/);
    assert.match(context, /sh-01, sh-02, sh-03/);
    assert.doesNotMatch(context, /sh-04/);
    assert.match(context, CLAIM_COMMAND);
    assert.doesNotMatch(context, /KRN onboarding/);
  });
});

test("the hook stays silent with a continuing capsule, an empty queue, no managed block, or PreCompact", async () => {
  await withDir(async (dir) => {
    writeInstructions(dir);
    makeTicket(dir, "sh-01", "ready");
    makeCapsule(dir, "out-1", "ACTIVE");
    const context = hookContext(dir, "SessionStart");
    assert.match(context, /finish the capsule slice/);
    assert.doesNotMatch(context, /KRN ready queue/);
  });
  await withDir(async (dir) => {
    writeInstructions(dir);
    assert.equal(hookContext(dir, "SessionStart"), null, "an empty queue emits nothing");
  });
  await withDir(async (dir) => {
    writeInstructions(dir, { managed: false });
    makeTicket(dir, "sh-01", "ready");
    const context = hookContext(dir, "SessionStart");
    assert.match(context, /KRN onboarding/);
    assert.doesNotMatch(context, /KRN ready queue/);
  });
  await withDir(async (dir) => {
    writeInstructions(dir);
    makeTicket(dir, "sh-01", "ready");
    const context = hookContext(dir, "PreCompact");
    assert.doesNotMatch(String(context), /KRN ready queue/);
  });
});
