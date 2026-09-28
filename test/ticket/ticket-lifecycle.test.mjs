import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const baseFields = {
  Id: "t-1",
  Title: "First ticket",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "src/a.mjs",
  "Deciding check": "node --test test/a.test.mjs",
  Contract: "test/a.test.mjs:red->green",
  Acceptance: "the check passes",
  "Blocked by": "none",
};

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-life-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("claim writes the claim before work and removes the ticket from the frontier", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t1.md");
    writeFileSync(file, ticket(baseFields));
    const result = ticketLib.claimTicket({ file, worker: "stub", session: "s-1" });
    assert.equal(result.status, "claimed");
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: claimed$/m);
    assert.match(text, /^Claim: worker=stub; session=s-1; at=/m);
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, []);
    assert.throws(() => ticketLib.claimTicket({ file, worker: "stub" }), /already-claimed/);
  });
});

test("close writes evidence and resolution and unblocks the next ticket", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const first = join(dir, ".krn/tickets", "t1.md");
    const second = join(dir, ".krn/tickets", "t2.md");
    writeFileSync(first, ticket(baseFields));
    writeFileSync(second, ticket({ ...baseFields, Id: "t-2", Title: "Second", "Blocked by": "t-1" }));
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-1"]);
    ticketLib.claimTicket({ file: first, worker: "stub" });
    const closed = ticketLib.closeTicket({ file: first, evidence: "commit abc123; gate green", resolution: "merged locally" });
    assert.equal(closed.status, "done");
    const text = readFileSync(first, "utf8");
    assert.match(text, /^Status: done$/m);
    assert.match(text, /^Evidence: commit abc123; gate green$/m);
    assert.match(text, /^Resolution: merged locally \(closed /m);
    assert.deepEqual(ticketLib.checkTickets({ root: dir }).frontier, ["t-2"]);
    assert.throws(() => ticketLib.closeTicket({ file: first }), /already terminal/);
  });
});

test("lookup resolves an id to its file and rejects unknown ids", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t1.md");
    writeFileSync(file, ticket(baseFields));
    assert.equal(ticketLib.findTicketFile({ root: dir, id: "t-1" }), file);
    assert.throws(() => ticketLib.findTicketFile({ root: dir, id: "nope" }), /no ticket with id/);
  });
});
