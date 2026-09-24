import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const CONTRACT = "test/ticket/ticket-contract-crosscheck.test.mjs:red->green";

const baseFields = {
  Id: "sh-15",
  Title: "Cross-check the envelope Contract against the commit's declared trailer",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "src-a.mjs",
  "Deciding check": "node --test test/ticket/ticket-contract-crosscheck.test.mjs",
  Contract: CONTRACT,
  Acceptance: "the head commit's Change-contract trailer names the ticket Contract ref",
  "Blocked by": "none",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);

function makeRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-contract-"));
  git(dir, ["init", "-q"]);
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  writeFileSync(join(dir, ".krn/tickets", "sh-15.md"), ticket(baseFields));
  writeFileSync(join(dir, "src-a.mjs"), "export const a = 1;\n");
  git(dir, ["add", "-A"]);
  commit(dir, "seed");
  const base = git(dir, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(dir, "src-a.mjs"), "export const a = 2;\n");
  git(dir, ["add", "-A"]);
  commit(dir, body ? `work\n\n${body}` : "work");
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  return { dir, base, head };
}

const withRepo = (body, run) => {
  const repo = makeRepo(body);
  try {
    run(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
};

const contractErrors = (report) =>
  report.errors.filter((entry) => entry.rule === "contract-mismatch" || entry.rule === "contract-missing");

test("checkTickets accepts a head commit whose Change-contract names the ticket Contract", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo(`Ticket: sh-15\nChange-contract: ${CONTRACT}`, ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-15", base, head });
    assert.deepEqual(contractErrors(report), [], JSON.stringify(report.errors));
  });
});

test("checkTickets fails contract-mismatch when the trailer names another check", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("Ticket: sh-15\nChange-contract: test/ticket/renamed.test.mjs:red->green", ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-15", base, head });
    const found = contractErrors(report);
    assert.equal(found.length, 1, JSON.stringify(report.errors));
    assert.equal(found[0].rule, "contract-mismatch");
    assert.equal(found[0].path, join(".krn/tickets", "sh-15.md"));
    assert.match(found[0].message, /does not name/);
  });
});

test("checkTickets fails contract-missing when the ticket's commit declares no Change-contract", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("Ticket: sh-15", ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-15", base, head });
    const found = contractErrors(report);
    assert.equal(found.length, 1, JSON.stringify(report.errors));
    assert.equal(found[0].rule, "contract-missing");
    assert.equal(found[0].path, join(".krn/tickets", "sh-15.md"));
  });
});

test("checkTickets ignores a head commit that does not reference the ticket", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("unrelated work", ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-15", base, head });
    assert.deepEqual(contractErrors(report), [], JSON.stringify(report.errors));
  });
});

test("the CLI fails contract-mismatch and passes a matching trailer", () => {
  const run = (dir, base, head) =>
    spawnSync(process.execPath, [cli, "ticket", "check", "--root", dir, "--id", "sh-15", "--base", base, "--head", head], { encoding: "utf8" });
  withRepo("Ticket: sh-15\nChange-contract: test/ticket/renamed.test.mjs:red->green", ({ dir, base, head }) => {
    const result = run(dir, base, head);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /contract-mismatch/);
  });
  withRepo(`Ticket: sh-15\nChange-contract: ${CONTRACT}`, ({ dir, base, head }) => {
    const result = run(dir, base, head);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});
