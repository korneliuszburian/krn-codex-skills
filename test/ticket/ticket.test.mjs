import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  mkdirSync(join(dir, ".scratch"), { recursive: true });
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
    writeFileSync(join(dir, ".scratch", "t-1.md"), ticket(baseFields));
    const report = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
    assert.deepEqual(report.frontier, ["t-1"]);
  });
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
    mkdirSync(join(dir, ".scratch"), { recursive: true });
    writeFileSync(join(dir, ".scratch", "legacy.md"), ticket(baseFields));

    const store = openTaskStore(dir);
    const task = await store.add({ id: "store-task", title: "store task" });
    await store.markReady(task.id);
    const humanTask = await store.add({ id: "human-task", title: "Close without code integration" });
    await store.close(humanTask.id, { actor: "maintainer", reason: "the follow-up is complete" });

    const beforeActivation = ticketLib.checkTickets({ root: dir });
    assert.deepEqual(beforeActivation.tickets.map((entry) => entry.id), ["t-1"], "an unactivated task-store ref is only a prepared candidate");
    assert.deepEqual(beforeActivation.frontier, ["t-1"], "Markdown remains authoritative until the explicit selector is written");
    activateTaskQueueFixture(dir);

    const before = readFileSync(join(dir, ".scratch", "legacy.md"), "utf8");
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
    assert.throws(() => ticketLib.claimTicket({ file: join(dir, ".scratch", "legacy.md"), root: dir, id: "t-1", worker: "runner" }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.closeTicket({ file: join(dir, ".scratch", "legacy.md"), root: dir }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.recordAttempt({ file: join(dir, ".scratch", "legacy.md") }), /Git-ref task queue is active/);
    assert.throws(() => ticketLib.reconcileTickets({ root: dir }), /Git-ref task queue is active/);
    assert.equal(readFileSync(join(dir, ".scratch", "legacy.md"), "utf8"), before, "legacy writer adapters refuse to mutate once the Git-ref store exists");
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

test("statuses, required fields, duplicate ids, blockers, and cycles fail closed", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, Status: "opened" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "invalid-status"));
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, Title: "" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "missing-field"));
    writeFileSync(join(dir, ".scratch", "a.md"), ticket(baseFields));
    writeFileSync(join(dir, ".scratch", "b.md"), ticket({ ...baseFields }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "duplicate-id"));
    writeFileSync(join(dir, ".scratch", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-9" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "unknown-blocker"));
    writeFileSync(join(dir, ".scratch", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-1" }));
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, "Blocked by": "t-2" }));
    assert.ok(ticketLib.checkTickets({ root: dir }).errors.some((entry) => entry.rule === "dependency-cycle"));
  });
});

test("the frontier honors blockers and ordering", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".scratch", "b.md"), ticket({ ...baseFields, Id: "t-2", "Blocked by": "t-1" }));
    writeFileSync(join(dir, ".scratch", "a.md"), ticket(baseFields));
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-1"]);
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, Status: "done" }));
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-2"]);
  });
});

test("commit trailers surface orphan and open-ticket warnings", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    writeFileSync(join(dir, ".scratch", "a.md"), ticket(baseFields));
    execFileSync("git", ["-C", dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "work on t-1", "-m", "Ticket: t-1"]);
    execFileSync("git", ["-C", dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "--allow-empty", "-m", "work on t-9", "-m", "Ticket: t-9"]);
    const warnings = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(warnings.some((entry) => entry.rule === "open-ticket-committed"));
    assert.ok(warnings.some((entry) => entry.rule === "orphan-commit-ticket"));
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, Status: "abandoned" }));
    const closed = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(!closed.some((entry) => entry.rule === "open-ticket-committed" && entry.path.endsWith("a.md")), "an abandoned ticket is not open");
    writeFileSync(join(dir, ".scratch", "a.md"), ticket({ ...baseFields, Status: "deferred" }));
    const parked = ticketLib.checkTickets({ root: dir }).warnings;
    assert.ok(!parked.some((entry) => entry.rule === "open-ticket-committed" && entry.path.endsWith("a.md")), "a deferred ticket is not open");
  }, { git: true });
});
