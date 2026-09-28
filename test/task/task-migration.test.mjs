import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";
import { claimTicket, closeTicket, recordAttempt, reconcileTickets } from "../../scripts/lib/ticket/ticket.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = join(ROOT, "scripts/krn.mjs");
const REAL_GIT = realpathSync(process.env.PATH.split(delimiter).map((dir) => join(dir, "git")).find((file) => existsSync(file)));
const refs = ["refs/krn/queue", "refs/krn/queue-active"];

function task(root, ...args) {
  return spawnSync(process.execPath, [CLI, "task", ...args, "--root", root, "--json"], { encoding: "utf8" });
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
  const claimed = claimTicket({ root, file: join(root, ".krn/tickets/claimed-task.md"), worker: "old-worker" });
  assert.equal(claimed.claim.epoch, 1, "the source Markdown claim has one generation before import");
  const archive = join(root, ".krn/runs/migrate/legacy.json");
  mkdirSync(dirname(archive), { recursive: true });
  const migrate = ["store", "migrate", "--yes", "--archive", archive, "--actor", "operator", "--reason", "Adopt the selected task store"];
  return { root, archive, migrate };
}
function noRefs(root) {
  for (const ref of refs) assert.equal(spawnSync(REAL_GIT, ["-C", root, "rev-parse", "--verify", "--quiet", ref]).status, 1);
}
function start(root, args, env) {
  return startNode([CLI, "task", ...args, "--root", root, "--json"], env);
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
function selectorDropper(root) {
  const bin = join(root, "selector-bin");
  mkdirSync(bin, { recursive: true });
  const count = join(root, "selector-count");
  writeFileSync(count, "0");
  writeFileSync(join(bin, "git"), `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const real = ${JSON.stringify(REAL_GIT)};
if (args.includes("rev-parse") && args.includes("refs/krn/queue-active")) {
  const hits = Number(fs.existsSync(process.env.KRN_TEST_SELECTOR_COUNT) ? fs.readFileSync(process.env.KRN_TEST_SELECTOR_COUNT, "utf8") : "0") + 1;
  fs.writeFileSync(process.env.KRN_TEST_SELECTOR_COUNT, String(hits));
  if (hits === 2) {
    const drop = spawnSync(real, ["-C", process.env.KRN_TEST_REPO, "update-ref", "-d", "refs/krn/queue-active"], { encoding: "utf8" });
    if (drop.status !== 0) { process.stderr.write(drop.stderr); process.exit(drop.status ?? 1); }
  }
}
const input = args.includes("--stdin") ? fs.readFileSync(0) : undefined;
const result = spawnSync(real, args, { input, encoding: "utf8" });
process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
`, { mode: 0o700 });
  return { count, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, KRN_TEST_REPO: root, KRN_TEST_SELECTOR_COUNT: count } };
}

test("krn task store migrate plans and explicitly activates a legacy queue without a second store", () => {
  const { root, archive, migrate } = fixture();
  try {
    const original = readFileSync(join(root, ".krn/tickets/ready-task.md"));
    const plan = ok(task(root, "store", "migrate"));
    assert.equal(plan.status, "planned");
    assert.equal(plan.tasks, 2);
    noRefs(root);
    assert.equal(ok(task(root, "store", "lock")).status, "free", "recovery inspection must work before activation");
    const applied = ok(task(root, ...migrate));
    assert.equal(applied.status, "migrated");
    assert.equal(applied.tasks, 2);
    assert.ok(existsSync(archive), "explicit migration keeps the original bytes in an archive");
    assert.deepEqual(readFileSync(join(root, ".krn/tickets/ready-task.md")), original);
    assert.deepEqual(ok(task(root, "list")).map((entry) => entry.id).sort(), ["claimed-task", "ready-task"]);
    assert.equal(ok(task(root, "show", "--id", "claimed-task")).Id, "claimed-task");
    assert.equal(ok(task(root, ...migrate)).status, "already-active");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public migration plans without writes and atomically selects a lossless imported queue", () => {
  const { root, archive, migrate } = fixture();
  try {
    const claimedFile = join(root, ".krn/tickets/claimed-task.md");
    writeFileSync(claimedFile, readFileSync(claimedFile, "utf8").replace("session=;", "session=ticket-session;"));
    const before = readFileSync(join(root, ".krn/tickets/ready-task.md"));
    const plan = ok(task(root, "store", "migrate"));
    assert.equal(plan.status, "planned");
    assert.equal(plan.tasks, 2);
    assert.deepEqual(plan.report.errors, []);
    assert.equal(plan.report.ambiguities.length, 1);
    noRefs(root);
    assert.equal(existsSync(archive), false);
    const unresolved = task(root, ...migrate);
    assert.notEqual(unresolved.status, 0);
    assert.match(unresolved.stderr, /unresolved claim ambiguities/);
    noRefs(root);
    assert.equal(existsSync(archive), false);
    const decisionsFile = join(dirname(archive), "decisions.json");
    writeFileSync(decisionsFile, JSON.stringify(plan.report.ambiguities.map((entry) => ({
      ...entry, source: "ticket", actor: "operator", reason: "Retain the named session after inspecting both sources",
    }))));
    const applied = ok(task(root, ...migrate, "--file", decisionsFile));
    assert.equal(applied.status, "migrated");
    assert.equal(applied.tasks, 2);
    const backup = JSON.parse(readFileSync(archive, "utf8"));
    assert.equal(backup.entries.length, 3);
    assert.deepEqual(Buffer.from(backup.entries.find((entry) => entry.path === ".krn/tickets/ready-task.md").content, "base64"), before);
    const state = JSON.parse(git(root, "cat-file", "blob", refs[0]));
    assert.equal(state.tasks["ready-task"].legacyFields["Custom Field"], "preserve exactly");
    assert.equal(state.tasks["claimed-task"].owner, "old-worker");
    assert.equal(state.tasks["claimed-task"].epoch, 1, "the legacy claim generation must survive import");
    assert.equal(state.tasks["claimed-task"].lease.session, "ticket-session");
    assert.equal(state.importReceipt.actor, "operator");
    assert.equal(state.importReceipt.reason, "Adopt the selected task store");
    assert.equal(ok(task(root, ...migrate)).status, "already-active");
    const created = ok(task(root, "add", "--title", "New work after migration"));
    ok(task(root, "close", "--id", created.id, "--actor", "operator", "--reason", "Handled manually"));
    rmSync(join(root, ".krn/tickets"), { recursive: true });
    rmSync(join(root, ".krn/claims"), { recursive: true });
    assert.deepEqual(ok(task(root, "check")).errors, []);
    assert.deepEqual(ok(task(root, "next")).frontier, ["ready-task"]);
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
    const refused = task(root, ...migrate);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /queue-write-busy/);
    assert.equal(existsSync(archive), false);
    noRefs(root);
    writeFileSync(resume, "continue");
    const finished = await writer.done;
    assert.equal(finished.status, 0, finished.stderr);
    writer = null;
    assert.equal(ok(task(root, ...migrate)).status, "migrated");
    const state = JSON.parse(git(root, "cat-file", "blob", refs[0]));
    assert.equal(state.tasks["ready-task"].owner, "earlier-worker");
    assert.equal(state.tasks["ready-task"].epoch, 1);
  } finally {
    if (writer) { writer.child.kill("SIGKILL"); await writer.done; }
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty-only setup cannot silently import a pre-existing Markdown task", async () => {
  const { root, archive } = fixture();
  try {
    rmSync(join(root, ".krn/tickets/claimed-task.md"));
    rmSync(join(root, ".krn/claims/claimed-task.lock"));
    const original = readFileSync(join(root, ".krn/tickets/ready-task.md"));
    await assert.rejects(openTaskStore(root).migrateLegacyQueue({
      apply: true, archiveFile: archive, actor: "setup-repository-workflow",
      reason: "Initialize an empty selected queue", requireEmpty: true,
    }), /existing Markdown tasks require explicit reviewed migration/);
    noRefs(root);
    assert.equal(existsSync(archive), false, "a refused empty-only setup cannot archive or activate foreign work");
    assert.deepEqual(readFileSync(join(root, ".krn/tickets/ready-task.md")), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public migration initializes an empty repository without creating legacy ticket files", () => {
  const base = mkdtempSync(join(tmpdir(), "krn-empty-migrate-"));
  try {
    const root = join(base, "repository");
    mkdirSync(root);
    git(root, "init", "-q");
    const result = ok(task(root, "store", "migrate", "--yes", "--archive", join(base, "empty.json"), "--actor", "operator", "--reason", "Initialize the local queue"));
    assert.equal(result.tasks, 0);
    assert.equal(existsSync(join(root, ".krn/tickets")), false);
    const created = ok(task(root, "add", "--title", "First ordinary task"));
    assert.equal(created.status, "open");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("public claimed-task writes fence the caller epoch even when the worker name is reused", async () => {
  const { root, migrate } = fixture();
  try {
    ok(task(root, ...migrate));
    const created = ok(task(root, "add", "--title", "Generation-bound human work"));
    ok(task(root, "ready", "--id", created.id));
    const first = await openTaskStore(root).claim(created.id, { worker: "same-worker", session: "old-session", at: "2000-01-01T00:00:00Z" });
    const current = ok(task(root, "takeover", "--id", created.id, "--worker", "same-worker", "--session", "new-session", "--expected-epoch", String(first.epoch), "--reason", "Resume in a new session"));
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
        const refused = task(root, ...args, "--id", created.id, ...epochArgs);
        assert.notEqual(refused.status, 0, args[0]);
        assert.equal(git(root, "rev-parse", refs[0]), before, "missing/stale generation must not write the current task");
      }
    }
    ok(task(root, "comment", "--id", created.id, "--worker", "same-worker", "--expected-epoch", String(current.epoch), "--body", "Current session comment"));
    ok(task(root, "renew", "--id", created.id, "--worker", "same-worker", "--expected-epoch", String(current.epoch)));
    assert.equal(ok(task(root, "close", "--id", created.id, "--actor", "same-worker", "--expected-epoch", String(current.epoch), "--reason", "Accepted by the current executor")).status, "done");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public task creation and lane admission require a complete recipe and keep proof-gated closure", () => {
  const { root, migrate, archive } = fixture();
  try {
    ok(task(root, ...migrate));
    const created = ok(task(root, "add", "--title", "Assign this task to a lane"));
    const file = join(dirname(archive), "recipe.json");
    writeFileSync(file, JSON.stringify({ base: "main" }));
    const before = git(root, "rev-parse", refs[0]);
    assert.notEqual(task(root, "edit", "--id", created.id, "--lane-recipe", file).status, 0);
    assert.equal(git(root, "rev-parse", refs[0]), before);
    const recipe = { base: "main", scope: "test/**,package.json", check: "node --test test/example.test.mjs", contract: "test/example.test.mjs:red->green", acceptance: "test/example.test.mjs verifies the candidate" };
    writeFileSync(file, JSON.stringify(recipe));
    const assigned = ok(task(root, "edit", "--id", created.id, "--lane-recipe", file));
    assert.equal(assigned.lane, true);
    assert.deepEqual(assigned.laneRecipe, recipe);
    const closed = task(root, "close", "--id", created.id, "--actor", "operator", "--reason", "Attempt a plain close");
    assert.notEqual(closed.status, 0);
    assert.match(closed.stderr, /proof-gated close/);
    const newLane = ok(task(root, "add", "--title", "Created with a lane recipe", "--lane-recipe", file));
    assert.equal(newLane.lane, true);
    assert.deepEqual(newLane.laneRecipe, recipe);
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
    const claimedFile = join(root, ".krn/tickets/claimed-task.md");
    for (const [operation, writer] of [
      ["claim", () => claimTicket({ root, file: join(root, ".krn/tickets/ready-task.md"), worker: "late-worker" })],
      ["fail", () => recordAttempt({ root, file: claimedFile, reason: "late failure" })],
      ["close", () => closeTicket({ root, file: claimedFile, resolution: "late close" })],
      ["reconcile", () => reconcileTickets({ root })],
    ]) {
      assert.throws(writer, /queue-write-busy/, `${operation} must not bypass the migration owner lock`);
    }
    for (const [file, bytes] of original) assert.deepEqual(readFileSync(join(root, file)), bytes);
    const held = ok(task(root, "store", "lock"));
    assert.equal(held.ownerState, "alive");
    const unlock = ["store", "unlock", "--token", held.owner.token, "--actor", "operator", "--reason", "Recover interrupted migration"];
    const liveUnlock = task(root, ...unlock);
    assert.notEqual(liveUnlock.status, 0, "a live owner is not expired by recovery");
    assert.match(liveUnlock.stderr, /queue owner is alive or its process liveness is unknown/);
    pending.child.kill("SIGKILL");
    process.kill(Number(readFileSync(`${barrier}.ready`, "utf8")), "SIGKILL");
    await pending.done;
    pending = null;
    noRefs(root);
    assert.equal(existsSync(archive), true, "the completed rollback archive may outlive interrupted activation");
    assert.equal(ok(task(root, "store", "lock")).ownerState, "dead");
    const recoveryA = start(root, unlock, process.env), recoveryB = start(root, unlock, process.env);
    const recovered = [ok(await recoveryA.done), ok(await recoveryB.done)];
    assert.equal(recovered.filter((result) => result.recovered).length, 1);
    const again = gitBarrier(root, "retry");
    barrier = again.barrier;
    pending = start(root, migrate, again.env);
    await waitFor(`${barrier}.ready`);
    const newGuard = ok(task(root, "store", "lock"));
    assert.notEqual(newGuard.owner.token, held.owner.token);
    assert.equal(ok(task(root, ...unlock)).recovered, false);
    assert.equal(ok(task(root, "store", "lock")).owner.token, newGuard.owner.token);
    writeFileSync(`${barrier}.go`, "continue");
    assert.equal(ok(await pending.done).status, "migrated");
    pending = null;
    assert.equal(ok(task(root, "store", "lock")).status, "free");
    for (const [file, bytes] of original) assert.deepEqual(readFileSync(join(root, file)), bytes);
    assert.deepEqual(ok(task(root, "next")).frontier, ["ready-task"]);
    assert.equal(ok(task(root, "claim", "--id", "ready-task", "--worker", "new-store-worker")).owner, "new-store-worker");
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
    const held = ok(task(root, "store", "lock"));
    const exited = new Promise((resolve) => pending.child.once("exit", resolve));
    pending.child.kill("SIGKILL");
    await exited;
    assert.equal(ok(task(root, "store", "lock")).ownerState, "dead");
    ok(task(root, "store", "unlock", "--token", held.owner.token, "--actor", "operator", "--reason", "Recover while a Git helper survives"));
    assert.equal(claimTicket({ root, file: join(root, ".krn/tickets/ready-task.md"), worker: "later-worker" }).claim.epoch, 1);
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

test("public task CLI reads imported ticket records and fences a reused worker generation", () => {
  const { root, migrate } = fixture();
  try {
    ok(task(root, ...migrate));
    assert.match(ok(task(root, "show", "--id", "claimed-task")).Claim, /worker=old-worker/);
    const created = ok(task(root, "add", "--id", "new-task", "--title", "Use the task CLI"));
    assert.equal(created.id, "new-task");
    const child = ok(task(root, "add", "--id", "dependent", "--title", "Wait for new-task", "--depends-on", created.id));
    assert.equal(child.status, "open");
    assert.notEqual(task(root, "ready", "--id", child.id).status, 0, "dependency must still block readiness");
    ok(task(root, "ready", "--id", created.id));
    assert.equal(ok(task(root, "next")).frontier.includes(created.id), true);
    const first = ok(task(root, "claim", "--id", created.id, "--worker", "same-worker"));
    assert.equal(first.epoch, 1);
    ok(task(root, "comment", "--id", created.id, "--worker", "same-worker", "--expected-epoch", "1", "--body", "First claim"));
    ok(task(root, "close", "--id", created.id, "--actor", "same-worker", "--expected-epoch", "1", "--reason", "First pass complete"));
    ok(task(root, "reopen", "--id", created.id, "--actor", "operator", "--reason", "Recheck worker generation"));
    ok(task(root, "ready", "--id", created.id));
    const second = ok(task(root, "claim", "--id", created.id, "--worker", "same-worker"));
    assert.equal(second.epoch, 2);
    const before = git(root, "rev-parse", refs[0]);
    const stale = task(root, "comment", "--id", created.id, "--worker", "same-worker", "--expected-epoch", "1", "--body", "Stale claim");
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale claim generation/);
    assert.equal(git(root, "rev-parse", refs[0]), before, "stale generation must not mutate the shared queue");
    ok(task(root, "close", "--id", created.id, "--actor", "same-worker", "--expected-epoch", "2", "--reason", "Current pass complete"));
    const closed = ok(task(root, "show", "--id", created.id));
    assert.equal(closed.Status, "done");
    assert.equal(closed.task.comments[0].body, "First claim");
    ok(task(root, "ready", "--id", child.id));
    assert.ok(ok(task(root, "next")).frontier.includes(child.id));
    assert.deepEqual(ok(task(root, "list")).map((item) => item.id).sort(),
      ["claimed-task", "dependent", "new-task", "ready-task"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public task intent, store and operation commands share the selected queue and effect", () => {
  const { root, migrate } = fixture();
  try {
    assert.notEqual(task(root, "next").status, 0, "task must not fall through to legacy Markdown when no Git-ref queue is selected");
    noRefs(root);
    ok(task(root, ...migrate));
    const beforeLegacyReconcile = git(root, "rev-parse", refs[0]);
    assert.notEqual(task(root, "reconcile").status, 0, "the new task name must not expose legacy reconciliation");
    assert.equal(git(root, "rev-parse", refs[0]), beforeLegacyReconcile);
    ok(task(root, "intent", "set", "--intent", "task-cutover", "--revision", "1", "--expected-revision", "0"));
    assert.deepEqual(ok(task(root, "intent", "get", "--intent", "task-cutover")),
      { intent: "task-cutover", revision: 1 });
    const recipeFile = join(root, ".krn/runs/route/recipe.json");
    mkdirSync(dirname(recipeFile), { recursive: true });
    const check = "node --test test/example.test.mjs";
    writeFileSync(recipeFile, JSON.stringify({ base: "main", scope: "test/**", check,
      contract: "test/example.test.mjs:red->green", acceptance: "one checked lane effect" }));
    const lane = ok(task(root, "add", "--id", "lane-route", "--title", "Checked lane effect", "--lane-recipe", recipeFile));
    assert.equal(lane.lane, true);
    ok(task(root, "ready", "--id", lane.id));
    const claimed = ok(task(root, "claim", "--id", lane.id, "--worker", "lane-owner"));
    writeFileSync(join(root, "candidate.txt"), "candidate for public task routing\n");
    const candidate = git(root, "hash-object", "-w", "candidate.txt");
    const input = join(root, ".krn/runs/route/operation.json");
    writeFileSync(input, JSON.stringify({ id: "route-1", taskId: lane.id, intent: "task-cutover", intentRevision: 1,
      effectRef: "refs/krn/effects/route-1", effectObject: candidate, candidateIdentity: candidate,
      checkResult: { candidateIdentity: candidate, command: check, exitCode: 0 },
      params: { target: candidate, intentRevision: 1 } }));
    assert.equal(ok(task(root, "operation", "prepare", "--file", ".krn/runs/route/operation.json")).status, "prepared");
    assert.equal(ok(task(root, "operation", "complete", "--id", "route-1", "--worker", "lane-owner", "--expected-epoch", String(claimed.epoch))).status, "ambiguous");
    assert.equal(ok(task(root, "operation", "apply", "--id", "route-1", "--worker", "lane-owner", "--expected-epoch", String(claimed.epoch))).status, "observed");
    assert.equal(git(root, "rev-parse", "refs/krn/effects/route-1"), candidate);
    assert.equal(ok(task(root, "show", "--id", lane.id)).Status, "done");
    const archive = ok(task(root, "store", "export"));
    assert.equal(archive.format, "krn-task-queue");
    assert.deepEqual(archive.refs.map((ref) => ref.name), refs);
    assert.deepEqual(archive.refs.map((ref) => ref.oid), refs.map((ref) => git(root, "rev-parse", ref)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public task claim cannot fall through to the legacy writer if the selector disappears mid-command", () => {
  const { root, migrate } = fixture();
  try {
    ok(task(root, ...migrate));
    const file = join(root, ".krn/tickets/ready-task.md");
    const original = readFileSync(file);
    const queue = git(root, "rev-parse", refs[0]);
    const { count, env } = selectorDropper(root);
    const attempt = spawnSync(process.execPath, [CLI, "task", "claim", "--root", root, "--id", "ready-task", "--worker", "race-owner", "--json"], { encoding: "utf8", env });
    assert.ok(Number(readFileSync(count, "utf8")) >= 2, "selector must disappear after preflight and before the public dispatch");
    assert.notEqual(attempt.status, 0, "the task name must refuse after losing its selected Git-ref queue");
    assert.deepEqual(readFileSync(file), original, "the legacy Markdown queue must remain untouched");
    assert.equal(git(root, "rev-parse", refs[0]), queue, "the selected task snapshot must not move");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public task reconcile refuses before it can enter the legacy writer", () => {
  const { root, migrate } = fixture();
  try {
    ok(task(root, ...migrate));
    const original = readFileSync(join(root, ".krn/tickets/claimed-task.md"));
    const { count, env } = selectorDropper(root);
    const attempt = spawnSync(process.execPath, [CLI, "task", "reconcile", "--root", root, "--json"], { encoding: "utf8", env });
    assert.equal(readFileSync(count, "utf8"), "1", "unsupported reconciliation must stop at the selected queue preflight");
    assert.notEqual(attempt.status, 0, "the new task name must not run Markdown reconciliation");
    assert.deepEqual(readFileSync(join(root, ".krn/tickets/claimed-task.md")), original);
    assert.equal(git(root, "rev-parse", refs[1]).length, 40, "the selector must remain active");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
