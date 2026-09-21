import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

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
