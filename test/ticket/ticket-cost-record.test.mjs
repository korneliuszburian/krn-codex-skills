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
  Id: "sh-49",
  Title: "Record wall time and tokens per closed ticket",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-cost-record.test.mjs",
  Contract: "test/ticket/ticket-cost-record.test.mjs:red->green",
  Acceptance: "close records wall seconds and tokens and check warns when a done ticket lacks them",
  "Blocked by": "none",
};

const COST = /Cost: wall=(\d+(?:\.\d+)?)s; tokens=(\d+)/;
const costOf = (text) => {
  const match = COST.exec(text);
  return match ? { wall: Number(match[1]), tokens: Number(match[2]) } : null;
};

const missingCost = (report) => report.warnings.filter((entry) => entry.rule === "missing-cost");

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-cost-"));
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("close appends the runner's wall seconds and tokens to the evidence line", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "sh-49.md");
    writeFileSync(file, ticket(baseFields));
    const result = ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "merged", wallSeconds: 254, tokens: 68000 });
    assert.equal(result.status, "done");
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Evidence: node --test green; Cost: wall=254s; tokens=68000$/m);
    assert.deepEqual(costOf(text), { wall: 254, tokens: 68000 });
  });
});

test("close leaves the evidence free of cost when the runner measured none", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "sh-49.md");
    writeFileSync(file, ticket(baseFields));
    ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "merged" });
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Evidence: node --test green$/m);
    assert.equal(costOf(text), null);
  });
});

test("check warns missing-cost only on a done ticket without one", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "sh-49.md");
    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: "node --test green" }));
    const missing = missingCost(ticketLib.checkTickets({ root: dir }));
    assert.equal(missing.length, 1, JSON.stringify(missing));
    assert.equal(missing[0].path, join(".scratch", "sh-49.md"));

    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: "node --test green; Cost: wall=254s; tokens=68000" }));
    assert.deepEqual(missingCost(ticketLib.checkTickets({ root: dir })), []);

    writeFileSync(file, ticket(baseFields));
    assert.deepEqual(missingCost(ticketLib.checkTickets({ root: dir })), [], "only done tickets are warned");
  });
});

test("the CLI closes with cost and check surfaces it when stripped", () => {
  withTickets((dir) => {
    const tickets = join(dir, ".scratch");
    const file = join(tickets, "sh-49.md");
    writeFileSync(file, ticket(baseFields));
    const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });

    const close = run("close", "--root", dir, "--path", tickets, "--id", "sh-49", "--evidence", "node --test green", "--resolution", "merged", "--wall-seconds", "254", "--tokens", "68000");
    assert.equal(close.status, 0, `${close.stdout}${close.stderr}`);
    assert.deepEqual(costOf(readFileSync(file, "utf8")), { wall: 254, tokens: 68000 });

    const green = run("check", "--root", dir);
    assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);
    assert.doesNotMatch(green.stderr, /missing-cost/);

    writeFileSync(file, readFileSync(file, "utf8").replace(/; Cost: wall=.*$/m, ""));
    const red = run("check", "--root", dir);
    assert.match(red.stderr, /missing-cost/);
  });
});
