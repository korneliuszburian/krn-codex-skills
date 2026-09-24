import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  Title: "Renewable lease",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-claim-lease.test.mjs",
  Contract: "test/ticket/ticket-claim-lease.test.mjs:red->green",
  Acceptance: "a claim is a lease that expires and can be reclaimed",
  "Blocked by": "none",
};

const T0 = "2026-09-17T00:00:00.000Z";
const plus = (iso, seconds) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-lease-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const expired = (warnings) => warnings.filter((entry) => entry.rule === "claim-expired");

test("a claim records renew and duration and keeps the lease lock", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const lockPath = join(dir, ".krn", "claims", "t-1.lock");
    const seen = [];
    const result = ticketLib.claimTicket({
      file,
      root: dir,
      id: "t-1",
      worker: "worker-a",
      session: "session-a",
      at: T0,
      duration: 120,
      observer: ({ lockPath: observed, claim }) => seen.push({ observed, claim }),
    });
    assert.equal(result.claim.renew, T0);
    assert.equal(result.claim.duration, 120);
    assert.deepEqual(seen[0].claim, { worker: "worker-a", session: "session-a", at: T0, epoch: 1, renew: T0, duration: 120 });
    assert.match(readFileSync(file, "utf8"), new RegExp(`^Claim: worker=worker-a; session=session-a; at=${T0}; epoch=1; renew=${T0}; duration=120$`, "m"));
    assert.equal(existsSync(lockPath), true, "the lock file is the durable lease record");
    const held = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(held.renew, T0);
    assert.equal(held.duration, 120);
  });
});

test("check warns claim-expired only once renew plus duration is in the past", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w", at: T0, duration: 60 });
    const early = ticketLib.checkTickets({ root: dir, now: plus(T0, 59) });
    assert.deepEqual(expired(early.warnings), [], "an unexpired lease must stay quiet");
    const late = ticketLib.checkTickets({ root: dir, now: plus(T0, 61) });
    assert.equal(expired(late.warnings).length, 1, JSON.stringify(late.warnings));
    assert.match(expired(late.warnings)[0].message, /t-1/);
    assert.equal(late.errors.length, 0, JSON.stringify(late.errors));
  });
});

test("an expired lease is reclaimable with epoch+1 while an unexpired lease refuses already-claimed", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const first = ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w-1", at: T0, duration: 60 });
    assert.equal(first.claim.epoch, 1);
    assert.throws(
      () => ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w-2", at: plus(T0, 30), duration: 60 }),
      /already-claimed/,
    );
    const deadline = plus(T0, 61);
    const second = ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w-2", at: deadline, duration: 60 });
    assert.equal(second.claim.epoch, 2);
    assert.equal(second.claim.renew, deadline);
    assert.match(readFileSync(file, "utf8"), /^Status: claimed$/m);
    assert.throws(
      () => ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w-3", at: deadline, duration: 60 }),
      /already-claimed/,
    );
  });
});

test("the CLI surfaces claim-expired for a claimed lease past its deadline", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-lease-cli-"));
  try {
    mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket({
      ...baseFields,
      Status: "claimed",
      Claim: `worker=w; session=; at=${T0}; epoch=1; renew=${T0}; duration=1`,
    }));
    const result = spawnSync(process.execPath, [cli, "ticket", "check", "--root", dir], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /claim-expired/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
