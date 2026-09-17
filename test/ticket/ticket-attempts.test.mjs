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
  Title: "Stalled worker",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-attempts.test.mjs",
  Contract: "test/ticket/ticket-attempts.test.mjs:red->green",
  Acceptance: "a stalled attempt is durable and the third blocks the ticket",
  "Blocked by": "none",
};

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-attempts-"));
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

function parseAttempts(text) {
  const records = [];
  for (const line of text.split("\n")) {
    const match = /^Attempts: count=(\d+); reason=(.*); at=(\S+)$/.exec(line.trim());
    if (match) records.push({ count: Number(match[1]), reason: match[2], at: match[3] });
  }
  return records;
}

const fieldMap = (ticketLib, text) => Object.fromEntries(ticketLib.parseTicketText(text).fields);

test("the module exposes a recordAttempt ledger", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  assert.equal(typeof ticketLib.recordAttempt, "function", "recordAttempt must be exported");
});

test("each stalled attempt appends a durable token and only the third blocks the ticket", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w", session: "s", at: "2026-09-17T00:00:00.000Z" });
    const baseline = fieldMap(ticketLib, readFileSync(file, "utf8"));

    const first = ticketLib.recordAttempt({ file, reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" });
    assert.deepEqual(
      { attempts: first.attempts, status: first.status, gate: first.gate },
      { attempts: 1, status: "claimed", gate: null },
    );
    let text = readFileSync(file, "utf8");
    assert.deepEqual(parseAttempts(text), [{ count: 1, reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" }]);
    assert.match(text, /^Status: claimed$/m);
    assert.doesNotMatch(text, /^Gate:/m);

    const second = ticketLib.recordAttempt({ file, reason: "no commit in 97s", at: "2026-09-17T00:02:00.000Z" });
    assert.deepEqual(
      { attempts: second.attempts, status: second.status, gate: second.gate },
      { attempts: 2, status: "claimed", gate: null },
    );
    text = readFileSync(file, "utf8");
    assert.deepEqual(parseAttempts(text), [
      { count: 1, reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" },
      { count: 2, reason: "no commit in 97s", at: "2026-09-17T00:02:00.000Z" },
    ]);
    assert.match(text, /^Status: claimed$/m);

    const third = ticketLib.recordAttempt({ file, reason: "no commit again", at: "2026-09-17T00:03:00.000Z" });
    assert.deepEqual(
      { attempts: third.attempts, status: third.status, gate: third.gate },
      { attempts: 3, status: "blocked", gate: "retries-exhausted" },
    );
    text = readFileSync(file, "utf8");
    assert.equal(parseAttempts(text).length, 3);
    assert.deepEqual(parseAttempts(text)[2], { count: 3, reason: "no commit again", at: "2026-09-17T00:03:00.000Z" });
    assert.match(text, /^Status: blocked$/m);
    assert.match(text, /^Gate: retries-exhausted$/m);

    const after = fieldMap(ticketLib, text);
    for (const [key, value] of Object.entries(baseline)) {
      if (key === "Status" || key === "Gate" || key === "Attempts") continue;
      assert.equal(after[key], value, `the blocked ticket must not rewrite ${key}`);
    }
    assert.equal(after.Claim, baseline.Claim);
  });
});

test("recordAttempt refuses a ticket that is not claimed and leaves it untouched", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const initial = readFileSync(file, "utf8");
    assert.throws(
      () => ticketLib.recordAttempt({ file, reason: "stalled", at: "2026-09-17T00:01:00.000Z" }),
      /cannot record an attempt/,
    );
    assert.equal(readFileSync(file, "utf8"), initial);
  });
});
