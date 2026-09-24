import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadTicket() {
  try {
    return await import("../../scripts/lib/ticket/ticket.mjs");
  } catch {
    return null;
  }
}

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const baseFields = {
  Id: "t-1",
  Title: "Lifecycle gate",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-lifecycle-gates.test.mjs",
  Contract: "test/ticket/ticket-lifecycle-gates.test.mjs:red->green",
  Acceptance: "the queue state machine fails closed at each gate",
  "Blocked by": "none",
};

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-gates-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("claim refuses while a declared blocker is not done", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const blocker = join(dir, ".krn/tickets", "b-1.md");
    const blocked = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(blocker, ticket({ ...baseFields, Id: "b-1", Title: "Open blocker" }));
    writeFileSync(blocked, ticket({ ...baseFields, "Blocked by": "b-1" }));
    assert.throws(
      () => ticketLib.claimTicket({ file: blocked, root: dir, id: "t-1", worker: "w" }),
      /blocked-by-open/,
    );
    assert.match(readFileSync(blocked, "utf8"), /^Status: ready$/m, "the refused claim must not mutate the ticket");
  });
});

test("close refuses a ticket that is still ready", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    assert.throws(
      () => ticketLib.closeTicket({ file, root: dir, evidence: "gate green", resolution: "merged" }),
      /close-status/,
    );
    assert.match(readFileSync(file, "utf8"), /^Status: ready$/m, "the refused close must not mutate the ticket");
  });
});

test("check reports a blocked ticket that carries no Gate", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket({ ...baseFields, Status: "blocked" }));
    const report = ticketLib.checkTickets({ root: dir });
    const hits = report.errors.filter((entry) => entry.rule === "blocked-without-gate");
    assert.equal(hits.length, 1, JSON.stringify(report.errors));
  });
});

test("an empty claim lock fails closed instead of granting a fresh epoch", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const claims = join(dir, ".krn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(claims, "t-1.lock"), "");
    assert.throws(
      () => ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w" }),
      /claim-lock-unreadable/,
    );
    assert.match(readFileSync(file, "utf8"), /^Status: ready$/m, "the refused claim must not mutate the ticket");
  });
});
