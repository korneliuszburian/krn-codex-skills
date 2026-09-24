import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// The ticket module was split into focused owners; this observer pins the
// facade so a later edit cannot silently drop a public export or the split.
const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = path.join(root, "scripts", "lib", "ticket");

const PUBLIC_API = [
  "parseTicketText",
  "ticketLaneBindings",
  "taskTicketView",
  "claimTicket",
  "closeTicket",
  "recordAttempt",
  "envFingerprint",
  "hasEnvFingerprint",
  "findTicketFile",
  "reconcileTickets",
  "checkTickets",
];

test("the ticket facade keeps the public API across the split", async () => {
  const facade = await import(pathToFileURL(path.join(dir, "ticket.mjs")).href);
  for (const name of PUBLIC_API) {
    assert.equal(typeof facade[name], "function", `ticket.mjs must still export ${name}`);
  }
});

test("the split owners exist as separate modules", () => {
  for (const module of ["ticket-abi.mjs", "ticket-check.mjs", "ticket-reconcile.mjs"]) {
    assert.ok(existsSync(path.join(dir, module)), `${module} must exist as a split owner`);
  }
});
