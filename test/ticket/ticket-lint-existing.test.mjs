import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const BASE = "main";
const EXISTING_REF = "test/ticket/ticket.test.mjs";
const NEW_REF = "test/ticket/ticket-lint-existing.test.mjs";

const baseFields = {
  Id: "sh-45",
  Title: "Lint the inverse envelope class",
  Status: "ready",
  Type: "task",
  "Repository-base": BASE,
  Scope: "scripts/lib/ticket/ticket.mjs, package.json",
  "Deciding check": `node --test ${EXISTING_REF}`,
  Contract: `${EXISTING_REF}:red->green`,
  Acceptance: "the queue leaves test outcomes to the executing lane preflight",
  "Blocked by": "none",
};

const fakeGit = (baseFiles) => (_dir, args) => {
  if (args[0] === "cat-file" && args[1] === "-e") {
    if (args[2] === `${BASE}^{commit}`) return { ok: true, out: "" };
    return { ok: baseFiles.has(args[2]), out: "" };
  }
  return { ok: false, out: "" };
};

const withRepo = (fields, body, { baseFiles = [] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-lint-existing-"));
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  writeFileSync(join(dir, ".krn/tickets", "sh-45.md"), ticket(fields));
  try {
    body({ dir, git: fakeGit(new Set([`${BASE}:scripts/lib/ticket/ticket.mjs`, ...baseFiles.map((file) => `${BASE}:${file}`)])) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const rules = (report) => report.errors.map((entry) => entry.rule);

test("the ticket module loads", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
});

// These historical case names are stable identities consumed by the frozen
// observer check. Their assertions now reject the old inference that existence
// establishes a green result; the executing lane owns outcome classification.
test("a ready ticket flipping an existing observer errors existing-check-red-flip", async () => {
  const ticketLib = await loadTicket();
  withRepo(baseFields, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.frontier, ["sh-45"]);
  }, { baseFiles: [EXISTING_REF] });
});

test("an existing observer declared green->green stays clean", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Contract: `${EXISTING_REF}:green->green` }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(rules(report), [], JSON.stringify(report.errors));
  }, { baseFiles: [EXISTING_REF] });
});

test("a new observer declared red->green does not trip existing-check-red-flip", async () => {
  const ticketLib = await loadTicket();
  withRepo({
    ...baseFields,
    Contract: `${NEW_REF}:red->green`,
    "Deciding check": `node --test ${NEW_REF}`,
    Acceptance: `the new observer ${NEW_REF} is red at base`,
  }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(report.errors, []);
  }, { baseFiles: [EXISTING_REF] });
});

test("a claimed lane flipping an existing observer is exempt", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Status: "claimed" }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(report.errors, []);
  }, { baseFiles: [EXISTING_REF] });
});

test("the queue lints only the offending ready ticket", async () => {
  const ticketLib = await loadTicket();
  withRepo(baseFields, ({ dir, git }) => {
    writeFileSync(join(dir, ".krn/tickets", "clean.md"), ticket({
      ...baseFields,
      Id: "sh-46",
      Contract: `${EXISTING_REF}:green->green`,
      "Deciding check": `node --test ${EXISTING_REF}`,
    }));
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.frontier, ["sh-45", "sh-46"]);
  }, { baseFiles: [EXISTING_REF] });
});
