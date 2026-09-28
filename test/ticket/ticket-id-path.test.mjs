import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { claimTicket } from "../../scripts/lib/ticket/ticket.mjs";

const ticket = (id) => [
  "<krn-ticket>",
  `Id: ${id}`,
  "Title: Keep claim locks in their namespace",
  "Status: ready",
  "Type: task",
  "Repository-base: main",
  "Scope: src/allowed.mjs",
  "Deciding check: node --test test/ticket/ticket-id-path.test.mjs",
  "Contract: test/ticket/ticket-id-path.test.mjs:red->green",
  "Acceptance: every ID maps to a contained claim lock",
  "Blocked by: none",
  "</krn-ticket>",
  "",
].join("\n");

test("claim locks are contained and injective for stable IDs", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-ticket-id-path-"));
  try {
    const queue = join(root, ".krn/tickets");
    mkdirSync(queue, { recursive: true });
    const ids = [
      "sh-179",
      "owner/repo#7",
      "~6f776e65722f7265706f2337",
      "/var/tmp/absolute",
      "../../escaped",
    ];
    const files = ids.map((id, index) => {
      const file = join(queue, `ticket-${index}.md`);
      writeFileSync(file, ticket(id));
      return file;
    });

    for (const [index, id] of ids.entries()) {
      const result = claimTicket({ root, file: files[index], id, worker: "fixture" });
      assert.equal(result.status, "claimed", `legacy claim ${id} must remain within the repository`);
    }

    const claims = join(root, ".krn", "claims");
    const lockFiles = readdirSync(claims).filter((name) => name.endsWith(".lock"));
    assert.equal(new Set(lockFiles).size, ids.length, "distinct ticket IDs need distinct lock files");
    assert.ok(lockFiles.includes("sh-179.lock"), "existing simple IDs keep their lock filename");
    assert.equal(lockFiles.length, ids.length);
    assert.equal(readdirSync(root).includes("escaped.lock"), false, "a traversal ID must not write beside the repository root");
    for (const file of files) assert.match(readFileSync(file, "utf8"), /^Status: claimed$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
