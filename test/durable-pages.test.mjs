import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDurablePages } from "../scripts/lib/durable-pages.mjs";

const HEADER = "Status: `accepted`. Consumer: maintainer. Owner: maintainer. Verified: 2026-09-10.\n";

function makeRoot({ topicHeader = HEADER, topicsRows = "| T | [topic.md](topic.md) | state | reopen |\n| C | [capabilities.md](../capabilities.md) | state | reopen |\n| M | [migration.md](../migration.md) | state | reopen |\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-durable-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "README.md"), `# Research index\n\n## Topics\n\n| Topic | State |\n|---|---|\n${topicsRows}\n`);
  writeFileSync(join(root, "docs", "research", "topic.md"), `# Topic\n\n${topicHeader}\nbody\n`);
  writeFileSync(join(root, "docs", "capabilities.md"), `# Caps\n\n${HEADER}\n`);
  writeFileSync(join(root, "docs", "migration.md"), `# Migration\n\n${HEADER}\n`);
  return root;
}

test("a complete durable surface reports no errors", () => {
  const root = makeRoot();
  assert.deepEqual(checkDurablePages({ root }).errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("a missing header field and a missing Topics row are reported", () => {
  const missingHeader = makeRoot({ topicHeader: "Status: `accepted`.\n" });
  const headerErrors = checkDurablePages({ root: missingHeader }).errors;
  assert.ok(headerErrors.some((error) => error.includes("Consumer:")), JSON.stringify(headerErrors));
  rmSync(missingHeader, { recursive: true, force: true });

  const missingRow = makeRoot({ topicsRows: "| T | [topic.md](topic.md) | state | reopen |\n" });
  const rowErrors = checkDurablePages({ root: missingRow }).errors;
  assert.ok(rowErrors.some((error) => error.includes("../capabilities.md")), JSON.stringify(rowErrors));
  rmSync(missingRow, { recursive: true, force: true });
});
