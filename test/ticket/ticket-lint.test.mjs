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
const NEW_REF = "test/ticket/ticket-lint.test.mjs";
const OLD_REF = "test/ticket/ticket.test.mjs";

const baseFields = {
  Id: "sh-31",
  Title: "Lint ticket envelopes",
  Status: "ready",
  Type: "task",
  "Repository-base": BASE,
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": `node --test ${NEW_REF}`,
  Contract: `${NEW_REF}:red->green`,
  Acceptance: "the queue reports the envelope lint verdicts",
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
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-lint-"));
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, ".scratch", "sh-31.md"), ticket(fields));
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

test("a ready ticket with a new Contract ref missing package.json in Scope errors scope-missing-package-json", async () => {
  const ticketLib = await loadTicket();
  withRepo(baseFields, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.ok(rules(report).includes("scope-missing-package-json"), JSON.stringify(report.errors));
    assert.equal(report.errors.find((entry) => entry.rule === "scope-missing-package-json").path, join(".scratch", "sh-31.md"));
  });
});

test("a ready ticket with a new Contract ref and an unnamed observer errors contract-ref-new", async () => {
  const ticketLib = await loadTicket();
  withRepo(baseFields, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.ok(rules(report).includes("contract-ref-new"), JSON.stringify(report.errors));
  });
});

test("package.json in Scope clears scope-missing-package-json", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Scope: "scripts/lib/ticket/ticket.mjs, package.json" }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.ok(!rules(report).includes("scope-missing-package-json"), JSON.stringify(report.errors));
    assert.ok(rules(report).includes("contract-ref-new"), JSON.stringify(report.errors));
  });
});

test("an Acceptance naming the new observer clears contract-ref-new", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Acceptance: `the new observer ${NEW_REF} is red at base` }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.ok(!rules(report).includes("contract-ref-new"), JSON.stringify(report.errors));
    assert.ok(rules(report).includes("scope-missing-package-json"), JSON.stringify(report.errors));
  });
});

test("a Contract ref present at base is not a new observer", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Contract: `${OLD_REF}:red->green`, "Deciding check": `node --test ${OLD_REF}` }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.deepEqual(rules(report), [], JSON.stringify(report.errors));
  }, { baseFiles: [OLD_REF] });
});

test("a claimed lane is not blocked by the envelope lint", async () => {
  const ticketLib = await loadTicket();
  withRepo({ ...baseFields, Status: "claimed" }, ({ dir, git }) => {
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.ok(!rules(report).includes("scope-missing-package-json"), JSON.stringify(report.errors));
    assert.ok(!rules(report).includes("contract-ref-new"), JSON.stringify(report.errors));
  });
});

test("the queue lints only the offending ready ticket", async () => {
  const ticketLib = await loadTicket();
  withRepo(baseFields, ({ dir, git }) => {
    writeFileSync(join(dir, ".scratch", "clean.md"), ticket({
      ...baseFields,
      Id: "sh-32",
      Scope: "scripts/lib/ticket/ticket.mjs, package.json",
      Acceptance: `the new observer ${NEW_REF} is red at base`,
    }));
    const report = ticketLib.checkTickets({ root: dir, git });
    assert.equal(report.errors.length, 2, JSON.stringify(report.errors));
    assert.ok(report.errors.every((entry) => entry.path === join(".scratch", "sh-31.md")), JSON.stringify(report.errors));
  });
});
