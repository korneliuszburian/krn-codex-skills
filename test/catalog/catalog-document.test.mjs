import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_SERVER_KEYS,
  appendPrefix,
  applyOperations,
  assertSingleBlock,
  indexNamedBlocks,
  parseEnabled,
  quoteToml,
  removeBlock,
  setEnabled,
} from "../../scripts/lib/catalog/catalog-document.mjs";
import { parseDocument } from "../../scripts/lib/catalog/catalog-toml.mjs";

const source = "[mcp_servers.demo]\n# keep me\nenabled = true\n";
const blockFor = (text, kind = "mcp", id = "demo") =>
  assertSingleBlock(indexNamedBlocks(parseDocument(text).blocks, kind).get(id));

test("applyOperations applies edits in reverse offset order", () => {
  assert.equal(
    applyOperations("abcdef", [
      { start: 0, end: 1, text: "X" },
      { start: 4, end: 5, text: "Y" },
    ]),
    "XbcdYf",
  );
  assert.throws(
    () =>
      applyOperations("abcdef", [
        { start: 0, end: 3, text: "X" },
        { start: 2, end: 4, text: "Y" },
      ]),
    /Overlapping or invalid config operation/,
  );
});

test("setEnabled toggles an existing flag and inserts a missing one", () => {
  const document = parseDocument(source);
  const operations = [];
  const actions = [];
  setEnabled({
    document,
    block: blockFor(source),
    enabled: false,
    allowedKeys: MCP_SERVER_KEYS,
    target: "mcp",
    resource: "mcp",
    reason: "test",
    operations,
    actions,
  });
  assert.equal(applyOperations(source, operations), "[mcp_servers.demo]\n# keep me\nenabled = false\n");
  assert.deepEqual(actions, [{ operation: "set", resource: "mcp", target: "mcp", enabled: false, reason: "test" }]);

  const withoutFlag = "[mcp_servers.demo]\n";
  const insert = [];
  setEnabled({
    document: parseDocument(withoutFlag),
    block: blockFor(withoutFlag),
    enabled: true,
    allowedKeys: MCP_SERVER_KEYS,
    target: "mcp",
    resource: "mcp",
    reason: "test",
    operations: insert,
    actions: [],
  });
  assert.equal(applyOperations(withoutFlag, insert), "[mcp_servers.demo]\nenabled = true\n");
});

test("setEnabled accepts every documented MCP transport key, including http_headers_helper", () => {
  const text = [
    "[mcp_servers.demo]",
    'url = "https://mcp.example.com/mcp"',
    'http_headers_helper = "print-headers"',
    'http_headers = { "X-Region" = "eu" }',
    'env_http_headers = { "X-Token" = "TOKEN_ENV" }',
    'bearer_token_env_var = "TOKEN_ENV"',
    'default_tools_approval_mode = "prompt"',
    "enabled = true",
    "",
  ].join("\n");
  const operations = [];
  setEnabled({
    document: parseDocument(text),
    block: blockFor(text),
    enabled: false,
    allowedKeys: MCP_SERVER_KEYS,
    target: "mcp",
    resource: "mcp",
    reason: "test",
    operations,
    actions: [],
  });
  assert.equal(operations.length, 1);
  assert.match(applyOperations(text, operations), /enabled = false/);
});

test("removeBlock deletes the managed block", () => {
  const operations = [];
  const actions = [];
  removeBlock({
    document: parseDocument(source),
    block: blockFor(source),
    allowedKeys: MCP_SERVER_KEYS,
    target: "mcp",
    resource: "mcp",
    reason: "test",
    operations,
    actions,
  });
  assert.equal(applyOperations(source, operations), "");
  assert.deepEqual(actions, [{ operation: "remove", resource: "mcp", target: "mcp", reason: "test" }]);
});

test("parseEnabled accepts only literal booleans", () => {
  const document = parseDocument(source);
  assert.deepEqual(parseEnabled(document, 2, "mcp"), { enabled: true, prefix: "enabled = ", suffix: "" });
  assert.throws(() => parseEnabled(parseDocument("[mcp_servers.demo]\nenabled = 1\n"), 1, "mcp"), /literal boolean/);
});

test("appendPrefix and quoteToml format appended blocks", () => {
  assert.equal(appendPrefix("", "\n"), "");
  assert.equal(appendPrefix("a", "\n"), "\n\n");
  assert.equal(appendPrefix("a\n", "\n"), "\n");
  assert.equal(appendPrefix("a\n\n", "\n"), "");
  assert.equal(quoteToml('a"b'), '"a\\"b"');
});

test("indexNamedBlocks groups by id and assertSingleBlock rejects duplicates", () => {
  const document = parseDocument("[mcp_servers.a]\n[mcp_servers.a]\n");
  const index = indexNamedBlocks(document.blocks, "mcp");
  assert.equal(index.get("a").length, 2);
  assert.throws(() => assertSingleBlock(index.get("a"), "mcp"), /Duplicate managed config block/);
});
