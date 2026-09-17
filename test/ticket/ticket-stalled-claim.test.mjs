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
  Title: "Stalled claim",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-stalled-claim.test.mjs",
  Contract: "test/ticket/ticket-stalled-claim.test.mjs:red->green",
  Acceptance: "a re-claimed ticket with an older attempt warns stalled-claim",
  "Blocked by": "none",
  Claim: "worker=w; session=s; at=2026-09-17T00:10:00.000Z; epoch=2",
};

const readyFields = { ...baseFields, Status: "ready" };
delete readyFields.Claim;

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-stalled-"));
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const stalled = (warnings) => warnings.filter((entry) => entry.rule === "stalled-claim");

test("checkTickets warns stalled-claim when the last attempt predates the claim", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(
      file,
      ticket({ ...baseFields, Attempts: "count=1; reason=no commit in 69s; at=2026-09-17T00:01:00.000Z" }),
    );
    const report = ticketLib.checkTickets({ root: dir });
    const found = stalled(report.warnings);
    assert.equal(found.length, 1, JSON.stringify(report.warnings));
    assert.match(found[0].message, /t-1/);
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  });
});

test("checkTickets stays silent when the last attempt is newer than the claim", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(
      file,
      ticket({ ...baseFields, Attempts: "count=1; reason=no commit in 69s; at=2026-09-17T00:20:00.000Z" }),
    );
    assert.equal(stalled(ticketLib.checkTickets({ root: dir }).warnings).length, 0);
  });
});

test("checkTickets does not warn for a claimed ticket with no attempt yet", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    assert.equal(stalled(ticketLib.checkTickets({ root: dir }).warnings).length, 0);
  });
});

test("the CLI records a failed attempt through the ledger and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-fail-cli-"));
  try {
    mkdirSync(join(dir, ".scratch"), { recursive: true });
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(file, ticket(readyFields));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const claim = run("ticket", "claim", "--root", dir, "--id", "t-1", "--worker", "w", "--json");
    assert.equal(claim.status, 0, claim.stderr);

    const result = run("ticket", "fail", "--root", dir, "--id", "t-1", "--reason", "no commit in 69s", "--json");
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.attempts, 1);
    assert.equal(parsed.status, "claimed");

    const text = readFileSync(file, "utf8");
    assert.match(text, /^Attempts: count=1; reason=no commit in 69s; at=\d{4}-/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI check surfaces the stalled-claim warning", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-check-cli-"));
  try {
    mkdirSync(join(dir, ".scratch"), { recursive: true });
    const file = join(dir, ".scratch", "t-1.md");
    writeFileSync(
      file,
      ticket({ ...baseFields, Attempts: "count=1; reason=no commit in 69s; at=2026-09-17T00:01:00.000Z" }),
    );
    const result = spawnSync(process.execPath, [cli, "ticket", "check", "--root", dir], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /stalled-claim/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
