import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";
import { activateTaskQueueFixture } from "./task-queue-fixture.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = join(root, "scripts", "lib", "ticket", "ticket.mjs");

async function loadTicket() {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch {
    return null;
  }
}

const ticket = (fields, body = "") =>
  [
    "<krn-ticket>",
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    "</krn-ticket>",
    "",
    body,
  ].join("\n");

const baseFields = {
  Id: "t-1",
  Title: "Example ticket",
  Status: "ready",
  Type: "task",
  "Repository-base": "origin/main",
  Scope: "src/a.mjs",
  "Deciding check": "node --test test/a.test.mjs",
  Contract: "test/a.test.mjs:red->green",
  Acceptance: "the check passes",
  "Blocked by": "none",
};

const withRepo = (body, { git = false } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-"));
  if (git) {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "seed"]);
  }
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the ticket module parses the abi and exposes check and frontier", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  assert.equal(typeof ticketLib.checkTickets, "function");
});

test("ticket lane binding uses only the documented worker transports", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  assert.deepEqual(ticketLib.ticketLaneBindings(new Map([["Execution", "agent=maintainer; model=gpt-6-sol; effort=medium; parallel=none"]])), []);
  assert.deepEqual(ticketLib.ticketLaneBindings(new Map([["Execution", "agent=codex; model=gpt-6-sol; effort=medium; parallel=none"]])), [["TICKET_AGENT", "codex"]]);
  assert.deepEqual(ticketLib.ticketLaneBindings(new Map([["Execution", "agent=opencode; requested-model=gpt-6-sol; parallel=read-only"]])), [["TICKET_AGENT", "opencode"]]);
});

test("a valid ticket passes and defines the frontier", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".krn/tickets", "t-1.md"), ticket(baseFields));
    const report = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
    assert.deepEqual(report.frontier, ["t-1"]);
  });
});

test("the KRN ticket default reads .krn/tickets and ignores upstream .scratch files", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    mkdirSync(join(dir, ".scratch", "feature", "issues"), { recursive: true });
    mkdirSync(join(dir, ".krn", "tickets"), { recursive: true });
    writeFileSync(join(dir, ".scratch", "feature", "issues", "01.md"), ticket({ ...baseFields, Id: "foreign-ticket" }));
    writeFileSync(join(dir, ".krn", "tickets", "owned.md"), ticket({ ...baseFields, Id: "krn-ticket" }));
    const report = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.tickets.map((entry) => entry.id), ["krn-ticket"]);
    assert.deepEqual(report.frontier, ["krn-ticket"]);
  }, { git: true });
});

test("checkTickets selects the Git-ref task queue as its sole source when initialized", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  const dir = mkdtempSync(join(tmpdir(), "krn-task-queue-view-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
    writeFileSync(join(dir, ".krn/tickets", "legacy.md"), ticket(baseFields));

    const store = openTaskStore(dir);
    const task = await store.add({ id: "store-task", title: "store task" });
    await store.markReady(task.id);
    const humanTask = await store.add({ id: "human-task", title: "Close without code integration" });
    await store.close(humanTask.id, { actor: "maintainer", reason: "the follow-up is complete" });

    const beforeActivation = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(beforeActivation.tickets.map((entry) => entry.id), ["t-1"], "an unactivated task-store ref is only a prepared candidate");
    assert.deepEqual(beforeActivation.frontier, ["t-1"], "Markdown remains authoritative until the explicit selector is written");
    activateTaskQueueFixture(dir);

    const before = readFileSync(join(dir, ".krn/tickets", "legacy.md"), "utf8");
    const versionBeforeQuery = (await store.read()).version;
    const report = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(report.tickets.map((entry) => entry.id), ["human-task", "store-task"]);
    assert.equal(report.tickets[0].status, "done");
    assert.deepEqual(report.frontier, ["store-task"]);
    assert.deepEqual(report.errors, []);
    assert.equal(Object.hasOwn(report.tickets[0], "body"), false, "the compact queue check does not project task body or history");
    assert.equal(Object.hasOwn(report.tickets[0], "comments"), false);
    assert.equal(Object.hasOwn(report.tickets[0], "history"), false);
    assert.equal(report.warnings.some((warning) => warning.rule === "evidence-anchor-missing"), false, "ordinary human close does not invent a Git integration anchor");
    assert.equal((await store.read()).version, versionBeforeQuery, "queue checks are read-only against the active store");
    assert.ok(ticketLib.checkTickets({ root: dir, reconcile: true }).errors.some((error) => error.rule === "task-store-reconcile-unavailable"));
    assert.throws(() => ticketLib.claimTicket({ file: join(dir, ".krn/tickets", "legacy.md"), root: dir, id: "t-1", worker: "runner" }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.closeTicket({ file: join(dir, ".krn/tickets", "legacy.md"), root: dir }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.recordAttempt({ file: join(dir, ".krn/tickets", "legacy.md") }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.reconcileTickets({ root: dir }), /Git-ref task queue is active/);
    assert.equal(readFileSync(join(dir, ".krn/tickets", "legacy.md"), "utf8"), before, "legacy writer adapters refuse to mutate once the Git-ref store exists");
    const malformed = execFileSync("git", ["-C", dir, "hash-object", "-w", "--stdin"], {
      input: JSON.stringify({ version: 1, tasks: {} }), encoding: "utf8",
    }).trim();
    execFileSync("git", ["-C", dir, "update-ref", "refs/krn/queue", malformed]);
    const failedRead = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(failedRead.tickets, []);
    assert.deepEqual(failedRead.frontier, []);
    assert.equal(failedRead.errors[0].rule, "task-store-read-failed", "a corrupt active ref never falls back to Markdown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task CLI adds a title-only task, readies it and shows its history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-cli-"));
  const cli = join(root, "scripts", "krn.mjs");
  const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    const store = openTaskStore(dir);
    await store.add({ id: "seed-task", title: "Prepared store" });
    activateTaskQueueFixture(dir);

    const add = run("add", "--root", dir, "--id", "new-task", "--title", "Capture the task intent", "--body", "Keep the reason with the task", "--json");
    assert.equal(add.status, 0, `${add.stdout}${add.stderr}`);
    assert.equal(JSON.parse(add.stdout).status, "open");

    const ready = run("ready", "--root", dir, "--id", "new-task", "--json");
    assert.equal(ready.status, 0, `${ready.stdout}${ready.stderr}`);
    assert.equal(JSON.parse(ready.stdout).status, "ready");

    const next = run("next", "--root", dir, "--json");
    assert.equal(next.status, 0, `${next.stdout}${next.stderr}`);
    assert.deepEqual(JSON.parse(next.stdout).frontier, ["new-task"]);

    const claim = run("claim", "--root", dir, "--ready", "--worker", "maintainer", "--session", "task-cli", "--json");
    assert.equal(claim.status, 0, `${claim.stdout}${claim.stderr}`);
    assert.equal(JSON.parse(claim.stdout).status, "claimed");

    const comment = run("comment", "--root", dir, "--id", "new-task", "--worker", "maintainer", "--body", "checked the task intent", "--json");
    assert.equal(comment.status, 0, `${comment.stdout}${comment.stderr}`);
    assert.equal(JSON.parse(comment.stdout).body, "checked the task intent");

    const unattributedClose = run("close", "--root", dir, "--id", "new-task", "--reason", "the requested task is complete", "--json");
    assert.equal(unattributedClose.status, 64);
    assert.match(unattributedClose.stderr, /requires --actor/);

    const placeholderClose = run("close", "--root", dir, "--id", "new-task", "--actor", "maintainer", "--reason", "none", "--json");
    assert.equal(placeholderClose.status, 64);
    assert.match(placeholderClose.stderr, /non-placeholder reason/);

    const close = run("close", "--root", dir, "--id", "new-task", "--actor", "maintainer", "--reason", "the requested task is complete", "--json");
    assert.equal(close.status, 0, `${close.stdout}${close.stderr}`);
    assert.equal(JSON.parse(close.stdout).status, "done");
    assert.equal(JSON.parse(close.stdout).result.actor, "maintainer");

    const unattributedReopen = run("reopen", "--root", dir, "--id", "new-task", "--reason", "follow-up discovered", "--json");
    assert.equal(unattributedReopen.status, 64);
    assert.match(unattributedReopen.stderr, /requires --actor/);
    const reopen = run("reopen", "--root", dir, "--id", "new-task", "--actor", "maintainer", "--reason", "follow-up discovered", "--json");
    assert.equal(reopen.status, 0, `${reopen.stdout}${reopen.stderr}`);
    assert.equal(JSON.parse(reopen.stdout).status, "open");

    const show = run("show", "--root", dir, "--id", "new-task", "--json");
    assert.equal(show.status, 0, `${show.stdout}${show.stderr}`);
    const task = JSON.parse(show.stdout);
    assert.equal(task.Title, "Capture the task intent");
    assert.equal(task.Claim, undefined, "a reopened task does not project its old lease as current claim state");
    assert.equal(task.task.body, "Keep the reason with the task");
    assert.deepEqual(task.task.comments, [{ author: "maintainer", body: "checked the task intent" }]);
    assert.deepEqual(task.task.history.map((entry) => entry.type), ["added", "ready", "claimed", "comment", "closed", "reopened"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task CLI lists, edits and releases a claimed task as abandoned", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-cli-release-"));
  const cli = join(root, "scripts", "krn.mjs");
  const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    const store = openTaskStore(dir);
    await store.add({ id: "editable-task", title: "Original title", body: "Original body" });
    activateTaskQueueFixture(dir);

    const invalidAdd = run("add", "--root", dir, "--id", "invalid-task", "--title", "Should be refused", "--depends-on", "missing-task", "--json");
    assert.equal(invalidAdd.status, 64);
    assert.match(invalidAdd.stderr, /unknown dependency/);
    const list = run("list", "--root", dir, "--json");
    assert.equal(list.status, 0, `${list.stdout}${list.stderr}`);
    assert.deepEqual(JSON.parse(list.stdout).map((task) => task.id), ["editable-task"]);

    const invalidEdit = run("edit", "--root", dir, "--id", "editable-task", "--depends-on", "missing-task", "--json");
    assert.equal(invalidEdit.status, 64);
    assert.match(invalidEdit.stderr, /unknown dependency/);
    const intactAfterInvalidEdit = run("list", "--root", dir, "--json");
    assert.equal(intactAfterInvalidEdit.status, 0, `${intactAfterInvalidEdit.stdout}${intactAfterInvalidEdit.stderr}`);
    assert.deepEqual(JSON.parse(intactAfterInvalidEdit.stdout).map((task) => task.id), ["editable-task"]);

    const edit = run("edit", "--root", dir, "--id", "editable-task", "--title", "Updated title", "--body", "Updated body", "--json");
    assert.equal(edit.status, 0, `${edit.stdout}${edit.stderr}`);
    assert.equal(JSON.parse(edit.stdout).title, "Updated title");

    assert.equal(run("ready", "--root", dir, "--id", "editable-task").status, 0);
    assert.equal(run("claim", "--root", dir, "--id", "editable-task", "--worker", "maintainer", "--json").status, 0);
    const unattributedRelease = run("release", "--root", dir, "--id", "editable-task", "--reason", "operator stopped this attempt", "--json");
    assert.equal(unattributedRelease.status, 64);
    assert.match(unattributedRelease.stderr, /requires --actor/);
    const release = run("release", "--root", dir, "--id", "editable-task", "--actor", "maintainer", "--reason", "operator stopped this attempt", "--json");
    assert.equal(release.status, 0, `${release.stdout}${release.stderr}`);
    const task = JSON.parse(run("show", "--root", dir, "--id", "editable-task", "--json").stdout);
    assert.equal(task.Status, "abandoned");
    assert.equal(task.task.history.at(-1).type, "released");
    assert.equal(task.task.history.at(-1).reason, "operator stopped this attempt");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task CLI records typed failures and retains the retry gate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-cli-fail-"));
  const cli = join(root, "scripts", "krn.mjs");
  const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    const store = openTaskStore(dir);
    await store.add({ id: "failing-task", title: "Retry failure task" });
    await store.markReady("failing-task");
    activateTaskQueueFixture(dir);
    assert.equal(run("claim", "--root", dir, "--id", "failing-task", "--worker", "worker-a").status, 0);

    for (let index = 1; index <= 3; index += 1) {
      const failed = run("fail", "--root", dir, "--id", "failing-task", "--worker", "worker-a", "--signature", "same-failure", "--reason", "no progress");
      assert.equal(failed.status, 0, `${failed.stdout}${failed.stderr}`);
      assert.equal(JSON.parse(failed.stdout).attempts, index);
      const task = await store.show("failing-task");
      assert.equal(task.attempts.length, index);
    }

    const report = run("check", "--root", dir, "--json");
    assert.equal(report.status, 1, `${report.stdout}${report.stderr}`);
    const checked = JSON.parse(report.stdout);
    assert.equal(checked.tickets[0].status, "blocked");
    assert.ok(checked.errors.some((error) => error.rule === "stalled-signature"));

    const show = JSON.parse(run("show", "--root", dir, "--id", "failing-task", "--json").stdout);
    assert.match(show.Gate, /retries-exhausted/);
    assert.match(show.Attempts, /signature=same-failure/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task CLI records an audited takeover after lease expiry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-cli-takeover-"));
  const cli = join(root, "scripts", "krn.mjs");
  const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    const store = openTaskStore(dir);
    await store.add({ id: "expired-claim", title: "Recover interrupted work" });
    await store.markReady("expired-claim");
    await store.claim("expired-claim", { worker: "worker-old", at: "2000-01-01T00:00:00.000Z", duration: 10 });
    activateTaskQueueFixture(dir);

    const takeover = run("takeover", "--root", dir, "--id", "expired-claim", "--worker", "worker-new", "--expected-epoch", "1", "--reason", "resume after lost worker", "--json");
    assert.equal(takeover.status, 0, `${takeover.stdout}${takeover.stderr}`);
    const recovered = JSON.parse(takeover.stdout);
    assert.equal(recovered.owner, "worker-new");
    assert.equal(recovered.epoch, 2);
    assert.equal(recovered.history.at(-1).reason, "resume after lost worker");

    const stale = run("takeover", "--root", dir, "--id", "expired-claim", "--worker", "worker-third", "--expected-epoch", "1", "--reason", "stale takeover", "--json");
    assert.equal(stale.status, 64);
    assert.match(stale.stderr, /claim generation changed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("statuses, required fields, duplicate ids, blockers, and cycles fail closed", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, Status: "opened" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "invalid-status"));
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, Title: "" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "missing-field"));
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket(baseFields));
    writeFileSync(join(dir, ".krn/tickets", "b.md"), ticket({ ...baseFields }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "duplicate-id"));
    writeFileSync(join(dir, ".krn/tickets", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-9" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "unknown-blocker"));
    writeFileSync(join(dir, ".krn/tickets", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-1" }));
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, "Blocked by": "t-2" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "dependency-cycle"));
  });
});

test("the frontier honors blockers and ordering", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".krn/tickets", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-1" }));
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket(baseFields));
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-1"]);
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, Status: "done" }));
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-2"]);
  });
});

test("commit trailers surface orphan and open-ticket warnings", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket(baseFields));
    execFileSync("git", ["-C", dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "work on t-1", "-m", "Ticket: t-1"]);
    execFileSync("git", ["-C", dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "work on t-9", "-m", "Ticket: t-9"]);
    const warnings = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(warnings.some((entry) => entry.rule === "open-ticket-committed"));
    assert.ok(warnings.some((entry) => entry.rule === "orphan-commit-ticket"));
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, Status: "abandoned" }));
    const closed = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(!closed.some((entry) => entry.rule === "open-ticket-committed" && entry.path.endsWith("a.md")), "an abandoned ticket is not open");
    writeFileSync(join(dir, ".krn/tickets", "a.md"), ticket({ ...baseFields, Status: "deferred" }));
    const parked = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(!parked.some((entry) => entry.rule === "open-ticket-committed" && entry.path.endsWith("a.md")), "a deferred ticket is not open");
  }, { git: true });
});
