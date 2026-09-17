import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, hostname, totalmem, tmpdir } from "node:os";
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
  Id: "sh-23",
  Title: "Record an environment fingerprint in lane evidence",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-env-fingerprint.test.mjs",
  Contract: "test/ticket/ticket-env-fingerprint.test.mjs:red->green",
  Acceptance: "close records a hash-only environment fingerprint and check warns when it is missing",
  "Blocked by": "none",
};

const ENV_LINE = /^Env: host=([0-9a-f]{12,64}); cpu=(\d+); mem=(\d+); node=(\S+)$/m;

const envOf = (text) => {
  const match = ENV_LINE.exec(text);
  return match ? { host: match[1], cpu: Number(match[2]), mem: Number(match[3]), node: match[4] } : null;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withTickets = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-env-"));
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the module exposes an environment fingerprint helper", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  assert.equal(typeof ticketLib.envFingerprint, "function", "envFingerprint must be exported");
});

test("close records a hash-only environment fingerprint beside the evidence", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "sh-23.md");
    writeFileSync(file, ticket(baseFields));
    ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "merged" });
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: done$/m);
    assert.match(text, /^Evidence: node --test green$/m, "the evidence line must be left intact");
    const env = envOf(text);
    assert.ok(env, `the closure must record an Env fingerprint: ${text}`);
    assert.equal(env.cpu, cpus().length);
    assert.equal(env.mem, Math.round(totalmem() / 1024 ** 3));
    assert.equal(env.node, process.versions.node);
    const fullHost = createHash("sha256").update(hostname()).digest("hex");
    assert.ok(fullHost.startsWith(env.host), "host must be a hash of the host identity");
    assert.doesNotMatch(text, new RegExp(escapeRegExp(hostname())), "the raw hostname must never be recorded");
  });
});

test("check warns missing-env-fingerprint only on a done ticket without one", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withTickets((dir) => {
    const file = join(dir, ".scratch", "sh-23.md");
    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: "node --test green" }));
    const report = ticketLib.checkTickets({ root: dir });
    const missing = report.warnings.filter((entry) => entry.rule === "missing-env-fingerprint");
    assert.equal(missing.length, 1, JSON.stringify(report.warnings));
    assert.equal(missing[0].path, join(".scratch", "sh-23.md"));

    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: "node --test green", Env: ticketLib.envFingerprint() }));
    const present = ticketLib.checkTickets({ root: dir }).warnings.filter((entry) => entry.rule === "missing-env-fingerprint");
    assert.deepEqual(present, []);
  });
});

test("the CLI closes with the fingerprint and check surfaces it when stripped", () => {
  withTickets((dir) => {
    const tickets = join(dir, ".scratch");
    const file = join(tickets, "sh-23.md");
    writeFileSync(file, ticket(baseFields));
    const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });

    const close = run("close", "--root", dir, "--path", tickets, "--id", "sh-23", "--evidence", "node --test green", "--resolution", "merged");
    assert.equal(close.status, 0, `${close.stdout}${close.stderr}`);
    assert.ok(envOf(readFileSync(file, "utf8")), "the CLI closure must record the fingerprint");

    const green = run("check", "--root", dir);
    assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);
    assert.doesNotMatch(green.stderr, /missing-env-fingerprint/);

    writeFileSync(file, readFileSync(file, "utf8").replace(/^Env:.*\n/m, ""));
    const red = run("check", "--root", dir);
    assert.match(red.stderr, /missing-env-fingerprint/);
  });
});
