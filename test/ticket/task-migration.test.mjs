import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = join(ROOT, "scripts/krn.mjs");
const REAL_GIT = realpathSync(process.env.PATH.split(delimiter).map((dir) => join(dir, "git")).find((file) => existsSync(file)));
const refs = ["refs/krn/queue", "refs/krn/queue-active"];

function run(root, ...args) {
  return spawnSync(process.execPath, [CLI, "ticket", ...args, "--root", root, "--json"], { encoding: "utf8" });
}
function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
}
function git(root, ...args) {
  const result = spawnSync(REAL_GIT, ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-task-migrate-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "-c", "user.name=fixture", "-c", "user.email=fixture@krn.local", "commit", "-q", "--allow-empty", "-m", "test: seed");
  mkdirSync(join(root, ".krn/tickets"), { recursive: true });
  for (const id of ["ready-task", "claimed-task"]) {
    writeFileSync(join(root, `.krn/tickets/${id}.md`), [
      "<krn-ticket>", `Id: ${id}`, `Title: ${id}`, "Status: ready", "Type: task",
      "Repository-base: main", "Scope: test/**, package.json", "Deciding check: node --test test/example.test.mjs",
      "Contract: test/example.test.mjs:red->green", "Acceptance: test/example.test.mjs verifies work state", "Blocked by: none",
      "Custom Field: preserve exactly", "</krn-ticket>", "", "Original body.", "",
    ].join("\n"));
  }
  ok(run(root, "claim", "--id", "claimed-task", "--worker", "old-worker"));
  const archive = join(root, ".krn/runs/migrate/legacy.json");
  mkdirSync(dirname(archive), { recursive: true });
  const migrate = ["store", "migrate", "--yes", "--archive", archive, "--actor", "operator", "--reason", "Adopt the selected task store"];
  return { root, archive, migrate };
}
function noRefs(root) {
  for (const ref of refs) assert.equal(spawnSync(REAL_GIT, ["-C", root, "rev-parse", "--verify", "--quiet", ref]).status, 1);
}
function start(root, args, env) {
  return startNode([CLI, "ticket", ...args, "--root", root, "--json"], env);
}
function startNode(args, env = process.env) {
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (value) => { stdout += value; });
  child.stderr.on("data", (value) => { stderr += value; });
  const done = new Promise((resolve) => child.on("close", (status) => resolve({ status, stdout, stderr })));
  return { child, done };
}
async function waitFor(file) {
  const deadline = Date.now() + 15_000;
  while (!existsSync(file) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(existsSync(file), `process did not reach the public Git transaction: ${file}`);
}
function gitBarrier(root, name) {
  const bin = join(root, "barrier-bin");
  mkdirSync(bin, { recursive: true });
  const barrier = join(root, name);
  writeFileSync(join(bin, "git"), `#!/usr/bin/env node
const fs = require("node:fs");
const {spawnSync} = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("update-ref") && args.includes("--stdin")) {
  fs.writeFileSync(process.env.KRN_TEST_BARRIER + ".ready", String(process.pid));
  while (!fs.existsSync(process.env.KRN_TEST_BARRIER + ".go")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}
const input = args.includes("--stdin") ? fs.readFileSync(0) : undefined;
const result = spawnSync(${JSON.stringify(REAL_GIT)}, args, {input, encoding:"utf8"});
if (args.includes("update-ref") && args.includes("--stdin")) fs.writeFileSync(process.env.KRN_TEST_BARRIER + ".done", String(result.status));
process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
`, { mode: 0o700 });
  return { barrier, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, KRN_TEST_BARRIER: barrier } };
}

test("public migration plans without writes and atomically selects a lossless imported queue", () => {
  const { root, archive, migrate } = fixture();
  try {
    const claimedFile = join(root, ".krn/tickets/claimed-task.md");
    writeFileSync(claimedFile, readFileSync(claimedFile, "utf8").replace("session=;", "session=ticket-session;"));
    const before = readFileSync(join(root, ".krn/tickets/ready-task.md"));
    const plan = ok(run(root, "store", "migrate"));
    assert.equal(plan.status, "planned");
    assert.equal(plan.tasks, 2);
    assert.deepEqual(plan.report.errors, []);
    assert.equal(plan.report.ambiguities.length, 1);
    noRefs(root);
    assert.equal(existsSync(archive), false);
    const unresolved = run(root, ...migrate);
    assert.notEqual(unresolved.status, 0);
    assert.match(unresolved.stderr, /unresolved claim ambiguities/);
    noRefs(root);
    assert.equal(existsSync(archive), false);
    const decisionsFile = join(dirname(archive), "decisions.json");
    writeFileSync(decisionsFile, JSON.stringify(plan.report.ambiguities.map((entry) => ({
      ...entry, source: "ticket", actor: "operator", reason: "Retain the named session after inspecting both sources",
    }))));
    const applied = ok(run(root, ...migrate, "--file", decisionsFile));
    assert.equal(applied.status, "migrated");
    assert.equal(applied.tasks, 2);
    const backup = JSON.parse(readFileSync(archive, "utf8"));
    assert.equal(backup.entries.length, 3);
    assert.deepEqual(Buffer.from(backup.entries.find((entry) => entry.path === ".krn/tickets/ready-task.md").content, "base64"), before);
    const state = JSON.parse(git(root, "cat-file", "blob", refs[0]));
    assert.equal(state.tasks["ready-task"].legacyFields["Custom Field"], "preserve exactly");
    assert.equal(state.tasks["claimed-task"].owner, "old-worker");
    assert.equal(state.tasks["claimed-task"].lease.session, "ticket-session");
    assert.equal(state.importReceipt.actor, "operator");
    assert.equal(state.importReceipt.reason, "Adopt the selected task store");
    assert.equal(ok(run(root, ...migrate)).status, "already-active");
    const created = ok(run(root, "add", "--title", "New work after migration"));
    ok(run(root, "close", "--id", created.id, "--actor", "operator", "--reason", "Handled manually"));
    rmSync(join(root, ".krn/tickets"), { recursive: true });
    rmSync(join(root, ".krn/claims"), { recursive: true });
    assert.deepEqual(ok(run(root, "check")).errors, []);
    assert.deepEqual(ok(run(root, "next")).frontier, ["ready-task"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a legacy writer already inside its critical section excludes migration until its final write", async () => {
  const { root, migrate, archive } = fixture();
  let writer = null;
  try {
    const ready = join(root, "writer.ready"), resume = join(root, "writer.go");
    const code = `import fs from "node:fs";
import {claimTicket} from ${JSON.stringify(pathToFileURL(join(ROOT, "scripts/lib/ticket/ticket.mjs")).href)};
claimTicket({root:${JSON.stringify(root)},file:${JSON.stringify(join(root, ".krn/tickets/ready-task.md"))},worker:"earlier-worker",observer:()=>{
fs.writeFileSync(${JSON.stringify(ready)},"ready");
while(!fs.existsSync(${JSON.stringify(resume)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
}});`;
    writer = startNode(["--input-type=module", "-e", code]);
    await waitFor(ready);
    const refused = run(root, ...migrate);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /queue-write-busy/);
    assert.equal(existsSync(archive), false);
    noRefs(root);
    writeFileSync(resume, "continue");
    const finished = await writer.done;
    assert.equal(finished.status, 0, finished.stderr);
    writer = null;
    assert.equal(ok(run(root, ...migrate)).status, "migrated");
    const state = JSON.parse(git(root, "cat-file", "blob", refs[0]));
    assert.equal(state.tasks["ready-task"].owner, "earlier-worker");
    assert.equal(state.tasks["ready-task"].epoch, 1);
  } finally {
    if (writer) { writer.child.kill("SIGKILL"); await writer.done; }
    rmSync(root, { recursive: true, force: true });
  }
});

test("public migration initializes an empty repository without creating legacy ticket files", () => {
  const base = mkdtempSync(join(tmpdir(), "krn-empty-migrate-"));
  try {
    const root = join(base, "repository");
    mkdirSync(root);
    git(root, "init", "-q");
    const result = ok(run(root, "store", "migrate", "--yes", "--archive", join(base, "empty.json"), "--actor", "operator", "--reason", "Initialize the local queue"));
    assert.equal(result.tasks, 0);
    assert.equal(existsSync(join(root, ".krn/tickets")), false);
    const task = ok(run(root, "add", "--title", "First ordinary task"));
    assert.equal(task.status, "open");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("public claimed-task writes fence the caller epoch even when the worker name is reused", async () => {
  const { root, migrate } = fixture();
  try {
    ok(run(root, ...migrate));
    const task = ok(run(root, "add", "--title", "Generation-bound human work"));
    ok(run(root, "ready", "--id", task.id));
    const first = await openTaskStore(root).claim(task.id, { worker: "same-worker", session: "old-session", at: "2000-01-01T00:00:00Z" });
    const current = ok(run(root, "takeover", "--id", task.id, "--worker", "same-worker", "--session", "new-session", "--expected-epoch", String(first.epoch), "--reason", "Resume in a new session"));
    assert.equal(current.epoch, first.epoch + 1);
    const before = git(root, "rev-parse", refs[0]);
    for (const args of [
      ["comment", "--worker", "same-worker", "--body", "Stale comment"],
      ["close", "--actor", "same-worker", "--reason", "Stale close"],
      ["fail", "--worker", "same-worker", "--reason", "Stale failure"],
      ["release", "--actor", "same-worker", "--reason", "Stale release"],
      ["renew", "--worker", "same-worker"],
    ]) {
      for (const epochArgs of [[], ["--expected-epoch", String(first.epoch)]]) {
        const refused = run(root, ...args, "--id", task.id, ...epochArgs);
        assert.notEqual(refused.status, 0, args[0]);
        assert.equal(git(root, "rev-parse", refs[0]), before, "missing/stale generation must not write the current task");
      }
    }
    ok(run(root, "comment", "--id", task.id, "--worker", "same-worker", "--expected-epoch", String(current.epoch), "--body", "Current session comment"));
    ok(run(root, "renew", "--id", task.id, "--worker", "same-worker", "--expected-epoch", String(current.epoch)));
    assert.equal(ok(run(root, "close", "--id", task.id, "--actor", "same-worker", "--expected-epoch", String(current.epoch), "--reason", "Accepted by the current executor")).status, "done");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public task creation and lane admission require a complete recipe and keep proof-gated closure", () => {
  const { root, migrate, archive } = fixture();
  try {
    ok(run(root, ...migrate));
    const task = ok(run(root, "add", "--title", "Assign this task to a lane"));
    const file = join(dirname(archive), "recipe.json");
    writeFileSync(file, JSON.stringify({ base: "main" }));
    const before = git(root, "rev-parse", refs[0]);
    assert.notEqual(run(root, "edit", "--id", task.id, "--lane-recipe", file).status, 0);
    assert.equal(git(root, "rev-parse", refs[0]), before);
    const recipe = { base: "main", scope: "test/**,package.json", check: "node --test test/example.test.mjs", contract: "test/example.test.mjs:red->green", acceptance: "test/example.test.mjs verifies the candidate" };
    writeFileSync(file, JSON.stringify(recipe));
    const assigned = ok(run(root, "edit", "--id", task.id, "--lane-recipe", file));
    assert.equal(assigned.lane, true);
    assert.deepEqual(assigned.laneRecipe, recipe);
    const closed = run(root, "close", "--id", task.id, "--actor", "operator", "--reason", "Attempt a plain close");
    assert.notEqual(closed.status, 0);
    assert.match(closed.stderr, /proof-gated close/);
    const created = ok(run(root, "add", "--title", "Created with a lane recipe", "--lane-recipe", file));
    assert.equal(created.lane, true);
    assert.deepEqual(created.laneRecipe, recipe);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration excludes legacy writers through activation and dead-owner recovery cannot steal a new guard", async () => {
  const { root, archive, migrate } = fixture();
  let pending = null;
  let barrier = null;
  try {
    const gate = gitBarrier(root, "first");
    barrier = gate.barrier;
    pending = start(root, migrate, gate.env);
    await waitFor(`${barrier}.ready`);
    const original = [".krn/tickets/ready-task.md", ".krn/tickets/claimed-task.md", ".krn/claims/claimed-task.lock"]
      .map((file) => [file, readFileSync(join(root, file))]);
    for (const args of [
      ["claim", "--id", "ready-task", "--worker", "late-worker"],
      ["fail", "--id", "claimed-task", "--reason", "late failure"],
      ["close", "--id", "claimed-task", "--resolution", "late close"],
      ["reconcile"],
    ]) {
      const refused = run(root, ...args);
      assert.notEqual(refused.status, 0, args.join(" "));
      assert.match(refused.stderr, /queue-write-busy/);
    }
    for (const [file, bytes] of original) assert.deepEqual(readFileSync(join(root, file)), bytes);
    const held = ok(run(root, "store", "lock"));
    assert.equal(held.ownerState, "alive");
    const unlock = ["store", "unlock", "--token", held.owner.token, "--actor", "operator", "--reason", "Recover interrupted migration"];
    assert.notEqual(run(root, ...unlock).status, 0, "a live owner is not expired by recovery");
    pending.child.kill("SIGKILL");
    process.kill(Number(readFileSync(`${barrier}.ready`, "utf8")), "SIGKILL");
    await pending.done;
    pending = null;
    noRefs(root);
    assert.equal(existsSync(archive), true, "the completed rollback archive may outlive interrupted activation");
    assert.equal(ok(run(root, "store", "lock")).ownerState, "dead");
    const recoveryA = start(root, unlock, process.env), recoveryB = start(root, unlock, process.env);
    const recovered = [ok(await recoveryA.done), ok(await recoveryB.done)];
    assert.equal(recovered.filter((result) => result.recovered).length, 1);
    const again = gitBarrier(root, "retry");
    barrier = again.barrier;
    pending = start(root, migrate, again.env);
    await waitFor(`${barrier}.ready`);
    const newGuard = ok(run(root, "store", "lock"));
    assert.notEqual(newGuard.owner.token, held.owner.token);
    assert.equal(ok(run(root, ...unlock)).recovered, false);
    assert.equal(ok(run(root, "store", "lock")).owner.token, newGuard.owner.token);
    writeFileSync(`${barrier}.go`, "continue");
    assert.equal(ok(await pending.done).status, "migrated");
    pending = null;
    assert.equal(ok(run(root, "store", "lock")).status, "free");
    for (const [file, bytes] of original) assert.deepEqual(readFileSync(join(root, file)), bytes);
    assert.deepEqual(ok(run(root, "next")).frontier, ["ready-task"]);
    assert.equal(ok(run(root, "claim", "--id", "ready-task", "--worker", "new-store-worker")).owner, "new-store-worker");
    for (const [file, bytes] of original) assert.deepEqual(readFileSync(join(root, file)), bytes);
  } finally {
    if (pending) {
      pending.child.kill("SIGKILL");
      if (barrier && existsSync(`${barrier}.ready`)) {
        try { process.kill(Number(readFileSync(`${barrier}.ready`, "utf8")), "SIGKILL"); } catch { /* already exited */ }
      }
      await pending.done;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("recovery fences a surviving Git helper before admitting a later legacy write", async () => {
  const { root, migrate } = fixture();
  const gate = gitBarrier(root, "orphan");
  let pending;
  try {
    pending = start(root, migrate, gate.env);
    await waitFor(`${gate.barrier}.ready`);
    const held = ok(run(root, "store", "lock"));
    const exited = new Promise((resolve) => pending.child.once("exit", resolve));
    pending.child.kill("SIGKILL");
    await exited;
    assert.equal(ok(run(root, "store", "lock")).ownerState, "dead");
    ok(run(root, "store", "unlock", "--token", held.owner.token, "--actor", "operator", "--reason", "Recover while a Git helper survives"));
    ok(run(root, "claim", "--id", "ready-task", "--worker", "later-worker"));
    writeFileSync(`${gate.barrier}.go`, "continue");
    await waitFor(`${gate.barrier}.done`);
    await pending.done;
    noRefs(root);
    assert.notEqual(readFileSync(`${gate.barrier}.done`, "utf8"), "0", "the orphan cannot activate its stale snapshot");
  } finally {
    if (pending && pending.child.exitCode === null && pending.child.signalCode === null) pending.child.kill("SIGKILL");
    if (existsSync(`${gate.barrier}.ready`) && !existsSync(`${gate.barrier}.done`)) {
      try { process.kill(Number(readFileSync(`${gate.barrier}.ready`, "utf8")), "SIGKILL"); } catch { /* already exited */ }
    }
    if (pending) await pending.done;
    rmSync(root, { recursive: true, force: true });
  }
});
