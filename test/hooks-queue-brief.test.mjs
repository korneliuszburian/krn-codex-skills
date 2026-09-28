import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { openTaskStore } from "../scripts/lib/task/task-store.mjs";
import { checkTickets } from "../scripts/lib/ticket/ticket.mjs";
import { activateTaskQueueFixture } from "./task/task-queue-fixture.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(root, "config", "opencode", "plugins", "krn.js");
const capsuleHook = join(root, "scripts", "hooks", "krn_capsule.py");
const hook = existsSync(capsuleHook) ? capsuleHook : join(root, "scripts", "hooks", "krn_memory.py");
const MANAGED_BLOCK = "<!-- krn-agent-workflow:start -->\nmanaged\n<!-- krn-agent-workflow:end -->\n";
const TASK_CLAIM_COMMAND = /krn task claim --root \. --id <id>/;

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

const makeTicket = (dir, id, status, blockedBy = "none", sub = ".krn/tickets") => {
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
      "Scope: scripts/hooks/krn_capsule.py",
      "Deciding check: true",
      "Contract: test/hooks-queue-brief.test.mjs:red->green",
      "Acceptance: the queue is named",
      `Blocked by: ${blockedBy}`,
      "</krn-ticket>",
      "",
    ].join("\n"),
  );
};

const withSelectedQueue = (body, populate = async (store) => {
  await store.add({ id: "selected-ready", title: "Selected Git-ref work" });
  await store.markReady("selected-ready");
}) => withDir(async (dir) => {
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "test", "hooks-queue-brief.test.mjs"), "// existing deciding check\n");
  git("add", "test/hooks-queue-brief.test.mjs");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@krn.local", "commit", "-q", "-m", "seed deciding check");
  writeInstructions(dir);
  makeTicket(dir, "legacy-decoy", "ready");
  const store = openTaskStore(dir);
  await populate(store);
  activateTaskQueueFixture(dir);
  await body({ dir, git, store });
});

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
});

test("the plugin names the three smallest ready ids and the claim command on one line", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir }) => {
    const brief = adapter.queueBrief(dir);
    assert.equal(typeof brief, "string");
    assert.equal(brief.split("\n").length, 1, "the brief is exactly one line");
    assert.match(brief, /KRN ready queue/);
    assert.match(brief, /sh-01, sh-02, sh-03/);
    assert.doesNotMatch(brief, /sh-04/);
    assert.match(brief, TASK_CLAIM_COMMAND);
  }, async (store) => {
    for (let index = 1; index <= 12; index += 1) {
      const id = `sh-${String(index).padStart(2, "0")}`;
      await store.add({ id, title: id });
      await store.markReady(id);
    }
  });
});

test("the plugin names only the frontier, resolving Blocked by against done ids", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir }) => {
    const brief = adapter.queueBrief(dir);
    assert.match(brief, /t-next/);
    assert.match(brief, /t-other/);
    assert.match(brief, /t-tickets/);
    assert.doesNotMatch(brief, /t-wait/);
  }, async (store) => {
    await store.add({ id: "t-done", title: "Finished prerequisite" });
    await store.close("t-done", { actor: "operator", reason: "Finished the prerequisite" });
    await store.add({ id: "t-next", title: "Next after dependency", dependencies: ["t-done"] });
    await store.markReady("t-next");
    await store.add({ id: "t-other", title: "Still open" });
    await store.markReady("t-other");
    await store.add({ id: "t-wait", title: "Wait for other task", dependencies: ["t-other"] });
    await store.add({ id: "t-tickets", title: "Unrelated ready work" });
    await store.markReady("t-tickets");
  });
});

test("the plugin does not advertise a queue that ticket check rejects", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir, git }) => {
    const previous = git("rev-parse", "refs/krn/queue").trim();
    const snapshot = JSON.parse(git("cat-file", "blob", previous));
    snapshot.tasks["selected-ready"].status = "invalid-status";
    const invalid = execFileSync("git", ["-C", dir, "hash-object", "-w", "--stdin"], {
      input: JSON.stringify(snapshot), encoding: "utf8",
    }).trim();
    git("update-ref", "refs/krn/queue", invalid, previous);
    const checked = spawnSync(process.execPath, [join(root, "scripts", "krn.mjs"), "task", "check", "--root", dir, "--json"], { encoding: "utf8" });
    assert.notEqual(checked.status, 0, "public task check rejects the same invalid selected queue");
    assert.match(checked.stderr, /active task store is invalid/);
    const result = spawnSync(process.execPath, [join(root, "scripts", "krn.mjs"), "task", "next", "--root", dir, "--json"], { encoding: "utf8" });
    assert.notEqual(result.status, 0, "the selected store is invalid");
    assert.equal(adapter.queueBrief(dir), null);
  });
});

test("the plugin stays silent with a continuing capsule, an empty queue, or no managed block", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir }) => {
    assert.match(adapter.queueBrief(dir), /KRN ready queue/);
    makeCapsule(dir, "out-1", "ACTIVE");
    assert.equal(adapter.queueBrief(dir), null, "a continuing capsule suppresses the queue brief");
  });
  await withSelectedQueue(async ({ dir }) => {
    assert.equal(adapter.queueBrief(dir), null, "a selected queue without ready work emits nothing");
  }, async (store) => {
    await store.add({ id: "done-only", title: "Completed work" });
    await store.close("done-only", { actor: "operator", reason: "Finished in fixture" });
  });
  await withSelectedQueue(async ({ dir }) => {
    writeInstructions(dir, { managed: false });
    assert.equal(adapter.queueBrief(dir), null, "an unmanaged tree emits no queue brief");
    assert.match(adapter.adoptionSignal(dir), /KRN onboarding/);
  });
});

test("the adapter injects the ready queue and keeps compaction silent", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir }) => {
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
  }, async (store) => {
    await store.add({ id: "sh-07", title: "Ready work" });
    await store.markReady("sh-07");
  });
});

test("OpenCode SessionStart briefs only the selected Git-ref frontier with the public task claim", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir }) => {
    const hooks = await adapter.KrnAdapter({ directory: dir });
    const system = [];
    await hooks["experimental.chat.system.transform"]({ sessionID: "selected" }, { system });
    assert.equal(system.length, 1);
    assert.match(system[0], /KRN ready queue: selected-ready\./);
    assert.doesNotMatch(system[0], /legacy-decoy/);
    assert.match(system[0], /Claim one with `krn task claim --root \. --id <id>`/);
    await hooks["experimental.chat.system.transform"]({ sessionID: "selected" }, { system });
    assert.equal(system.length, 1, "the selected brief is not duplicated");
    const context = [];
    await hooks["experimental.session.compacting"]({}, { context });
    assert.deepEqual(context, [], "compaction does not repeat the queue brief");
  });
});

test("OpenCode refuses a legacy queue brief when the selected Git-ref selector disappears", async () => {
  const adapter = await import(pathToFileURL(pluginPath).href);
  await withSelectedQueue(async ({ dir, git }) => {
    assert.match(adapter.queueBrief(dir), /selected-ready/);
    git("update-ref", "-d", "refs/krn/queue-active");
    const legacy = checkTickets({ root: dir });
    assert.deepEqual(legacy.errors, []);
    assert.deepEqual(legacy.frontier, ["legacy-decoy"], "a healthy Markdown queue is the negative control");
    const refused = spawnSync(process.execPath, [join(root, "scripts", "krn.mjs"), "task", "next", "--root", dir, "--json"], { encoding: "utf8" });
    assert.notEqual(refused.status, 0, "the public task command refuses an unselected queue");
    assert.equal(adapter.queueBrief(dir), null, "the host must not revive legacy-decoy as current work");
  });
});

test("Codex SessionStart briefs the selected Git-ref task and public task claim", async () => {
  await withSelectedQueue(async ({ dir }) => {
    const context = hookContext(dir, "SessionStart");
    assert.equal(typeof context, "string");
    assert.equal(context.split("\n").length, 1);
    assert.match(context, /KRN ready queue: selected-ready\./);
    assert.doesNotMatch(context, /legacy-decoy/);
    assert.match(context, TASK_CLAIM_COMMAND);
    assert.equal(hookContext(dir, "PreCompact"), null, "PreCompact has no duplicate queue context");
  });
});

test("Codex SessionStart refuses legacy work when the selected Git-ref selector disappears", async () => {
  await withSelectedQueue(async ({ dir, git }) => {
    assert.match(hookContext(dir, "SessionStart"), /selected-ready/);
    git("update-ref", "-d", "refs/krn/queue-active");
    const legacy = checkTickets({ root: dir });
    assert.deepEqual(legacy.errors, []);
    assert.deepEqual(legacy.frontier, ["legacy-decoy"], "the historical Markdown fixture remains healthy");
    assert.equal(hookContext(dir, "SessionStart"), null, "a lost selector cannot revive legacy advice");
  });
});

test("the SessionStart hook emits the ready-frontier line in a managed repo", async () => {
  await withSelectedQueue(async ({ dir }) => {
    const context = hookContext(dir, "SessionStart");
    assert.equal(typeof context, "string");
    assert.equal(context.split("\n").length, 1, "the brief is exactly one line");
    assert.match(context, /KRN ready queue/);
    assert.match(context, /sh-01, sh-02, sh-03/);
    assert.doesNotMatch(context, /sh-04/);
    assert.match(context, TASK_CLAIM_COMMAND);
    assert.doesNotMatch(context, /KRN onboarding/);
  }, async (store) => {
    for (let index = 1; index <= 12; index += 1) {
      const id = `sh-${String(index).padStart(2, "0")}`;
      await store.add({ id, title: id });
      await store.markReady(id);
    }
  });
});

test("the hook stays silent with a continuing capsule, an empty queue, no managed block, or PreCompact", async () => {
  await withSelectedQueue(async ({ dir }) => {
    makeCapsule(dir, "out-1", "ACTIVE");
    const context = hookContext(dir, "SessionStart");
    assert.match(context, /finish the capsule slice/);
    assert.doesNotMatch(context, /KRN ready queue/);
  });
  await withSelectedQueue(async ({ dir }) => {
    assert.equal(hookContext(dir, "SessionStart"), null, "an empty selected frontier emits nothing");
  }, async (store) => {
    await store.add({ id: "done-only", title: "Completed work" });
    await store.close("done-only", { actor: "operator", reason: "Finished in fixture" });
  });
  await withSelectedQueue(async ({ dir }) => {
    writeInstructions(dir, { managed: false });
    const context = hookContext(dir, "SessionStart");
    assert.match(context, /KRN onboarding/);
    assert.doesNotMatch(context, /KRN ready queue/);
  });
  await withSelectedQueue(async ({ dir }) => {
    assert.equal(hookContext(dir, "PreCompact"), null, "PreCompact stays silent with ready selected work");
  });
});
