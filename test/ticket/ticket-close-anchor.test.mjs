import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = join(root, "scripts", "lib", "ticket", "ticket.mjs");

async function loadTicket() {
  return import(pathToFileURL(modulePath).href);
}

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const CONTRACT = "test/ticket/ticket-close-anchor.test.mjs:red->green";

const baseFields = {
  Id: "sh-61",
  Title: "Make ticket close validate its anchors by default",
  Status: "claimed",
  Type: "bug",
  "Repository-base": "main",
  Scope: "src/allowed.mjs",
  "Deciding check": "node --test test/ticket/ticket-close-anchor.test.mjs",
  Contract: CONTRACT,
  Acceptance: "close without base refuses with a named rule and the head must carry the Ticket trailer",
  "Blocked by": "none",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
const rev = (dir, ref) => git(dir, ["rev-parse", ref]).trim();

const trailer = `Ticket: sh-61\nChange-contract: ${CONTRACT}`;

const inScope = (dir) => writeFileSync(join(dir, "src", "allowed.mjs"), "export const allowed = 2;\n");
const outOfScope = (dir) => {
  inScope(dir);
  writeFileSync(join(dir, "src", "forbidden.mjs"), "export const forbidden = 1;\n");
};

function makeRepo({ repositoryBase = "main", change = inScope, trailerText = trailer } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-close-anchor-"));
  git(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, ".krn/tickets", "sh-61.md"), ticket({ ...baseFields, "Repository-base": repositoryBase }));
  writeFileSync(join(dir, "src", "allowed.mjs"), "export const allowed = 1;\n");
  git(dir, ["add", "-A"]);
  commit(dir, "seed");
  const base = rev(dir, "HEAD");
  git(dir, ["checkout", "-q", "-b", "ticket/lane"]);
  change(dir);
  git(dir, ["add", "-A"]);
  commit(dir, trailerText ? `work\n\n${trailerText}` : "work");
  const head = rev(dir, "HEAD");
  return { dir, base, head, file: join(dir, ".krn/tickets", "sh-61.md") };
}

const withRepo = (options, body) => {
  const repo = makeRepo(options);
  try {
    body(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
};

test("close refuses a ticket whose Repository-base cannot be resolved", async () => {
  const ticketLib = await loadTicket();
  withRepo({ repositoryBase: "does-not-exist" }, ({ dir, file }) => {
    assert.throws(
      () => ticketLib.closeTicket({ file, root: dir, evidence: "gate green", resolution: "merged" }),
      /close-base-unresolved/,
    );
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: claimed$/m);
    assert.doesNotMatch(text, /^Evidence:/m);
  });
});

test("close refuses a head commit without the ticket's Ticket trailer", async () => {
  const ticketLib = await loadTicket();
  withRepo({ trailerText: "" }, ({ dir, file }) => {
    assert.throws(
      () => ticketLib.closeTicket({ file, root: dir, evidence: "gate green", resolution: "merged" }),
      /close-anchor-missing/,
    );
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: claimed$/m);
    assert.doesNotMatch(text, /^Evidence:/m);
  });
});

test("close refuses an out-of-scope change under an auto-resolved base", async () => {
  const ticketLib = await loadTicket();
  withRepo({ change: outOfScope }, ({ dir, file }) => {
    assert.throws(
      () => ticketLib.closeTicket({ file, root: dir, evidence: "gate green", resolution: "merged" }),
      /scope-undeclared/,
    );
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: claimed$/m);
    assert.doesNotMatch(text, /^Evidence:/m);
  });
});

test("close writes done when the base resolves and the head carries the anchor", async () => {
  const ticketLib = await loadTicket();
  withRepo({ change: inScope }, ({ dir, file }) => {
    const result = ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "merged" });
    assert.equal(result.status, "done");
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: done$/m);
    assert.match(text, /^Evidence: node --test green; integrated=[0-9a-f]{40}; patch=[0-9a-f]{40}$/m);
  });
});

test("close records an explicit unanchored bypass in the Resolution line", async () => {
  const ticketLib = await loadTicket();
  withRepo({ repositoryBase: "does-not-exist", trailerText: "" }, ({ dir, file }) => {
    const result = ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "adapted", allowUnanchored: true });
    assert.equal(result.status, "done");
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: done$/m);
    assert.match(text, /^Resolution: adapted; bypass=allow-unanchored \(closed /m);
  });
});
