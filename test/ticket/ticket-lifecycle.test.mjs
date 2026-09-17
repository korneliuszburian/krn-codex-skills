import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = join(root, "scripts", "lib", "ticket", "ticket.mjs");
const cli = join(root, "scripts", "krn-codex.mjs");

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
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the lifecycle module exposes claim, close, and lookup", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  assert.equal(typeof ticketLib.claimTicket, "function");
  assert.equal(typeof ticketLib.closeTicket, "function");
  assert.equal(typeof ticketLib.findTicketFile, "function");
});

test("claim writes the claim before work and removes the ticket from the frontier", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t1.md");
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
    const first = join(dir, ".scratch", "t1.md");
    const second = join(dir, ".scratch", "t2.md");
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

test("the CLI drives the whole loop over an absolute ticket path", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-cli-"));
  try {
    const tickets = join(dir, ".scratch", "tickets");
    mkdirSync(tickets, { recursive: true });
    const first = join(tickets, "t1.md");
    writeFileSync(first, ticket(baseFields));
    writeFileSync(join(tickets, "t2.md"), ticket({ ...baseFields, Id: "t-2", Title: "Second", "Blocked by": "t-1" }));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const next = run("ticket", "next", "--root", dir, "--path", tickets, "--json");
    assert.equal(next.status, 0, next.stderr);
    assert.deepEqual(JSON.parse(next.stdout).frontier, ["t-1"]);

    const claim = run("ticket", "claim", "--root", dir, "--path", tickets, "--id", "t-1", "--worker", "stub", "--json");
    assert.equal(claim.status, 0, claim.stderr);
    assert.equal(JSON.parse(claim.stdout).status, "claimed");
    assert.match(readFileSync(first, "utf8"), /^Claim: worker=stub; session=; at=\d{4}-/m);
    assert.deepEqual(JSON.parse(run("ticket", "next", "--root", dir, "--path", tickets, "--json").stdout).frontier, []);

    const close = run("ticket", "close", "--root", dir, "--path", tickets, "--id", "t-1", "--evidence", "gate green", "--resolution", "merged", "--json");
    assert.equal(close.status, 0, close.stderr);
    assert.equal(JSON.parse(close.stdout).status, "done");
    const text = readFileSync(first, "utf8");
    assert.match(text, /^Evidence: gate green$/m);
    assert.match(text, /^Resolution: merged \(closed /m);
    assert.deepEqual(JSON.parse(run("ticket", "next", "--root", dir, "--path", tickets, "--json").stdout).frontier, ["t-2"]);

    const refused = run("ticket", "claim", "--root", dir, "--path", tickets, "--id", "t-1", "--worker", "stub");
    assert.equal(refused.status, 64);
    assert.match(refused.stderr, /not ready/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lookup resolves an id to its file and rejects unknown ids", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t1.md");
    writeFileSync(file, ticket(baseFields));
    assert.equal(ticketLib.findTicketFile({ root: dir, id: "t-1" }), file);
    assert.throws(() => ticketLib.findTicketFile({ root: dir, id: "nope" }), /no ticket with id/);
  });
});
