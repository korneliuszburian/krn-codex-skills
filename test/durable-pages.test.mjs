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
  writeFileSync(join(root, "CONTEXT.md"), "# Context\n");
  return root;
}

test("a complete durable surface reports no errors", () => {
  const root = makeRoot();
  assert.deepEqual(checkDurablePages({ root }).errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("an accepted ADR missing from the knowledge map is reported", () => {
  const root = makeRoot();
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  writeFileSync(join(root, "docs", "adr", "0001-record.md"), "# ADR\n");

  writeFileSync(join(root, "CONTEXT.md"), "# Context\nmentions 0001-record.md without a link\n");
  assert.ok(
    checkDurablePages({ root }).errors.some((error) => error.includes("docs/adr/0001-record.md")),
    "a bare filename is not a link",
  );

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n<!-- [x](docs/adr/0001-record.md) -->\n```\n[x](docs/adr/0001-record.md)\n```\n");
  assert.ok(
    checkDurablePages({ root }).errors.some((error) => error.includes("docs/adr/0001-record.md")),
    "a commented or fenced link is not a link",
  );

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n    [x](docs/adr/0001-record.md)\n<!-- <!-- --> [x](docs/adr/0001-record.md) -->\n");
  assert.ok(
    checkDurablePages({ root }).errors.some((error) => error.includes("docs/adr/0001-record.md")),
    "an indented-code or nested-comment link is not a link",
  );

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n~~~\n[x](docs/adr/0001-record.md)\n~~~\n`[x](docs/adr/0001-record.md)`\n\\[x](docs/adr/0001-record.md)\n");
  assert.ok(
    checkDurablePages({ root }).errors.some((error) => error.includes("docs/adr/0001-record.md")),
    "tilde-fenced, inline-code, or escaped links are not links",
  );

  writeFileSync(join(root, "CONTEXT.md"), '# Context\n- [ADR](docs/adr/0001-record.md "title")\n');
  assert.deepEqual(checkDurablePages({ root }).errors, [], "a titled link is a link");

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n- [ADR](./docs/adr/0001-record.md)\n");
  assert.deepEqual(checkDurablePages({ root }).errors, [], "a ./ link is a link");

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n[adr]: docs/adr/0001-record.md\n");
  assert.deepEqual(checkDurablePages({ root }).errors, [], "a reference-style link is a link");

  rmSync(join(root, "CONTEXT.md"));
  assert.ok(
    checkDurablePages({ root }).errors.some((error) => error.includes("knowledge map")),
    "a missing CONTEXT.md with accepted ADRs must fail closed",
  );

  writeFileSync(join(root, "CONTEXT.md"), "# Context\n- [ADR](docs/adr/0001-record.md)\n");
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
