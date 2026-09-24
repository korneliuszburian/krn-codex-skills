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
  Title: "Locked ticket",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-claim-lock.test.mjs",
  Contract: "test/ticket/ticket-claim-lock.test.mjs:red->green",
  Acceptance: "the claim is won atomically",
  "Blocked by": "none",
};

const withRepo = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-claims-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("claim opens an exclusive lock carrying worker, session, at, and epoch before writing", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const lockPath = join(dir, ".krn", "claims", "t-1.lock");
    const held = [];
    const result = ticketLib.claimTicket({
      file,
      root: dir,
      id: "t-1",
      worker: "worker-a",
      session: "session-a",
      at: "2026-09-16T00:00:00.000Z",
      observer: ({ lockPath: observedPath, claim }) => {
        held.push({ observedPath, claim, present: existsSync(observedPath), text: readFileSync(file, "utf8") });
      },
    });
    assert.equal(held.length, 1, "the observer must run while the lock is held");
    assert.equal(held[0].observedPath, lockPath);
    assert.equal(held[0].present, true, "the lock file must exist before the ticket is written");
    assert.deepEqual(held[0].claim, { worker: "worker-a", session: "session-a", at: "2026-09-16T00:00:00.000Z", epoch: 1, renew: "2026-09-16T00:00:00.000Z", duration: 3600 });
    assert.equal(result.claim.epoch, 1);
    assert.match(readFileSync(file, "utf8"), /^Claim: worker=worker-a; session=session-a; at=2026-09-16T00:00:00.000Z; epoch=1; renew=2026-09-16T00:00:00.000Z; duration=\d+$/m);
    assert.equal(existsSync(lockPath), true, "the claim lock persists as the lease record");
  });
});

test("the observer interleave rejects the second claim with already-claimed and leaves the ticket untouched", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const initial = readFileSync(file, "utf8");
    const events = [];
    let rejection;
    ticketLib.claimTicket({
      file,
      root: dir,
      id: "t-1",
      worker: "worker-a",
      session: "session-a",
      observer: () => {
        events.push("a-read");
        try {
          ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "worker-b", session: "session-b" });
          events.push("b-committed");
        } catch (error) {
          rejection = error;
          events.push("b-rejected");
        }
        assert.equal(readFileSync(file, "utf8"), initial, "the loser must not mutate the ticket");
      },
    });
    assert.deepEqual(events, ["a-read", "b-rejected"], "B reads and is fenced inside A's critical section");
    assert.ok(rejection, "the interleaved claim must be rejected");
    assert.match(rejection.message, /already-claimed/);
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Claim: worker=worker-a;/m);
    assert.doesNotMatch(text, /worker-b/);
  });
});

test("the fencing epoch increments across successive claims", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket({ ...baseFields, Claim: "worker=old; session=; at=2026-01-01T00:00:00.000Z; epoch=4" }));
    const result = ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "worker-a", session: "session-a" });
    assert.equal(result.claim.epoch, 5);
    assert.match(readFileSync(file, "utf8"), /^Claim: worker=worker-a; session=session-a; at=.*; epoch=5; renew=.*; duration=\d+$/m);
  });
});

test("the CLI claims through the same lock and records the epoch", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-claim-cli-"));
  try {
    const tickets = join(dir, ".krn/tickets", "tickets");
    mkdirSync(tickets, { recursive: true });
    const file = join(tickets, "t-1.md");
    writeFileSync(file, ticket(baseFields));
    const result = spawnSync(
      process.execPath,
      [cli, "ticket", "claim", "--root", dir, "--path", tickets, "--id", "t-1", "--worker", "worker-a", "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).claim.epoch, 1);
    assert.match(readFileSync(file, "utf8"), /^Claim: worker=worker-a; session=; at=.*; epoch=1; renew=.*; duration=\d+$/m);
    assert.equal(existsSync(join(dir, ".krn", "claims", "t-1.lock")), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(".krn/claims/ is git-ignored", () => {
  const result = spawnSync("git", ["-C", root, "check-ignore", ".krn/claims/probe.lock"], { encoding: "utf8" });
  assert.equal(result.status, 0, `.krn/claims/ must be ignored: ${result.stdout}${result.stderr}`);
});
