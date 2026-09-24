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
  Title: "Stalled signature",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-stall-signature.test.mjs",
  Contract: "test/ticket/ticket-stall-signature.test.mjs:red->green",
  Acceptance: "a repeated attempt signature warns at two and errors at three",
  "Blocked by": "none",
  Claim: "worker=w; session=s; at=2026-09-17T00:10:00.000Z; epoch=2",
};

const readyFields = { ...baseFields, Status: "ready" };
delete readyFields.Claim;

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-signature-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

function attemptRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const match = /^Attempts:\s*count=(\d+)\b(.*)$/.exec(line.trim());
    if (!match) continue;
    const signature = /(?:^|;\s*)signature=([^;]*)/.exec(match[2])?.[1]?.trim() ?? "";
    rows.push({ count: Number(match[1]), signature });
  }
  return rows;
}

const claim = (ticketLib, dir) => {
  const file = join(dir, ".krn/tickets", "t-1.md");
  writeFileSync(file, ticket(readyFields));
  ticketLib.claimTicket({ file, root: dir, id: "t-1", worker: "w", session: "s", at: "2026-09-17T00:00:00.000Z" });
  return file;
};

const verdicts = (report, rule) => ({
  warnings: report.warnings.filter((entry) => entry.rule === rule),
  errors: report.errors.filter((entry) => entry.rule === rule),
});

test("recordAttempt writes an optional signature into the Attempts row", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = claim(ticketLib, dir);
    const result = ticketLib.recordAttempt({ file, reason: "no commit in 69s", signature: "sig-abc", at: "2026-09-17T00:01:00.000Z" });
    assert.equal(result.signature, "sig-abc");
    const rows = attemptRows(readFileSync(file, "utf8"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 1);
    assert.equal(rows[0].signature, "sig-abc");
  });
});

test("an attempt without a signature leaves the row unchanged", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = claim(ticketLib, dir);
    ticketLib.recordAttempt({ file, reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" });
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Attempts: count=1; reason=no commit in 69s; at=2026-09-17T00:01:00\.000Z$/m);
    assert.equal(attemptRows(text)[0].signature, "");
  });
});

test("checkTickets warns repeated-attempt-signature at two identical signatures", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = claim(ticketLib, dir);
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" });
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit in 97s", at: "2026-09-17T00:02:00.000Z" });
    const report = ticketLib.checkTickets({ root: dir });
    const repeated = verdicts(report, "repeated-attempt-signature");
    assert.equal(repeated.warnings.length, 1, JSON.stringify(report.warnings));
    assert.match(repeated.warnings[0].message, /sig-abc/);
    assert.equal(repeated.errors.length, 0);
    assert.equal(verdicts(report, "stalled-signature").errors.length, 0, JSON.stringify(report.errors));
  });
});

test("checkTickets errors stalled-signature at three identical signatures", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = claim(ticketLib, dir);
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" });
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit in 97s", at: "2026-09-17T00:02:00.000Z" });
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit again", at: "2026-09-17T00:03:00.000Z" });
    const report = ticketLib.checkTickets({ root: dir });
    const stalled = verdicts(report, "stalled-signature");
    assert.equal(stalled.errors.length, 1, JSON.stringify(report.errors));
    assert.match(stalled.errors[0].message, /sig-abc/);
    assert.equal(verdicts(report, "repeated-attempt-signature").warnings.length, 0, JSON.stringify(report.warnings));
  });
});

test("distinct signatures stay silent", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = claim(ticketLib, dir);
    ticketLib.recordAttempt({ file, signature: "sig-abc", reason: "no commit in 69s", at: "2026-09-17T00:01:00.000Z" });
    ticketLib.recordAttempt({ file, signature: "sig-def", reason: "no commit in 97s", at: "2026-09-17T00:02:00.000Z" });
    const report = ticketLib.checkTickets({ root: dir });
    assert.equal(verdicts(report, "repeated-attempt-signature").warnings.length, 0, JSON.stringify(report.warnings));
    assert.equal(verdicts(report, "stalled-signature").errors.length, 0, JSON.stringify(report.errors));
  });
});

test("the CLI fail command forwards a signature and check reports the stall", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-signature-cli-"));
  try {
    mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
    const file = join(dir, ".krn/tickets", "t-1.md");
    writeFileSync(file, ticket(readyFields));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const claimed = run("ticket", "claim", "--root", dir, "--id", "t-1", "--worker", "w", "--json");
    assert.equal(claimed.status, 0, claimed.stderr);
    for (const reason of ["no commit in 69s", "no commit in 97s", "no commit again"]) {
      const failed = run("ticket", "fail", "--root", dir, "--id", "t-1", "--reason", reason, "--signature", "sig-cli", "--json");
      assert.equal(failed.status, 0, failed.stderr);
    }
    assert.match(readFileSync(file, "utf8"), /^Attempts: count=3; signature=sig-cli; reason=no commit again; at=\d{4}-/m);
    const checked = run("ticket", "check", "--root", dir);
    assert.equal(checked.status, 1, checked.stderr);
    assert.match(checked.stderr, /stalled-signature/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
