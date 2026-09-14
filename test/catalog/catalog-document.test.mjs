import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_SERVER_KEYS,
  appendPrefix,
  applyOperations,
  assertSingleBlock,
  indexNamedBlocks,
  parseEnabled,
  parseSkillPath,
  quoteToml,
  removeBlock,
  setEnabled,
  skillPathContainsQuarantine,
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
    'oauth = { client_id = "abc" }',
    'tools = { my_tool = { approval_mode = "prompt" } }',
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

const trailingComment = '[mcp_servers.a]\ncommand = "x"\n# docs for b\n[mcp_servers.b]\nenabled = true\n';

test("removeBlock keeps the next block's leading comment", () => {
  const document = parseDocument(trailingComment);
  const blockA = assertSingleBlock(indexNamedBlocks(document.blocks, "mcp").get("a"));
  const operations = [];
  removeBlock({ document, block: blockA, allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations, actions: [] });
  assert.equal(applyOperations(trailingComment, operations), "# docs for b\n[mcp_servers.b]\nenabled = true\n");
});

test("setEnabled inserts before the next block's leading comment", () => {
  const document = parseDocument(trailingComment);
  const blockA = assertSingleBlock(indexNamedBlocks(document.blocks, "mcp").get("a"));
  const operations = [];
  setEnabled({ document, block: blockA, enabled: true, allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations, actions: [] });
  assert.equal(applyOperations(trailingComment, operations), '[mcp_servers.a]\ncommand = "x"\nenabled = true\n# docs for b\n[mcp_servers.b]\nenabled = true\n');
});

test("quoteToml escapes U+007F", () => {
  assert.ok(!/\u007f/.test(quoteToml("a\u007fb")));
  assert.ok(quoteToml("a\u007fb").includes("\\u007F"));
});

test("removeBlock drops the removed block's own trailing comment", () => {
  const last = '[mcp_servers.a]\ncommand = "x"\n# trailing for a\n';
  const ops = [];
  removeBlock({ document: parseDocument(last), block: blockFor(last, "mcp", "a"), allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations: ops, actions: [] });
  assert.equal(applyOperations(last, ops), "");

  const blankSeparated = '[mcp_servers.a]\ncommand = "x"\n# trailing for a\n\n[mcp_servers.b]\nenabled = true\n';
  const ops2 = [];
  removeBlock({ document: parseDocument(blankSeparated), block: blockFor(blankSeparated, "mcp", "a"), allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations: ops2, actions: [] });
  assert.equal(applyOperations(blankSeparated, ops2), "[mcp_servers.b]\nenabled = true\n");
});

test("block boundaries ignore comment-looking lines inside a multiline string", () => {
  const src = '[mcp_servers.a]\ncommand = """\necho hi\n# done """\n[mcp_servers.b]\nenabled = true\n';
  const ops = [];
  removeBlock({ document: parseDocument(src), block: blockFor(src, "mcp", "a"), allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations: ops, actions: [] });
  assert.equal(applyOperations(src, ops), '[mcp_servers.b]\nenabled = true\n');
  const insert = [];
  setEnabled({ document: parseDocument(src), block: blockFor(src, "mcp", "a"), enabled: true, allowedKeys: MCP_SERVER_KEYS, target: "a", resource: "mcp", reason: "t", operations: insert, actions: [] });
  assert.equal(applyOperations(src, insert), '[mcp_servers.a]\ncommand = """\necho hi\n# done """\nenabled = true\n[mcp_servers.b]\nenabled = true\n');
});

test("removeBlock drops the block's own leading comment", () => {
  const src = '[mcp_servers.a]\ncommand = "x"\n# docs for b\n[mcp_servers.b]\nenabled = true\n';
  const ops = [];
  removeBlock({ document: parseDocument(src), block: blockFor(src, "mcp", "b"), allowedKeys: MCP_SERVER_KEYS, target: "b", resource: "mcp", reason: "t", operations: ops, actions: [] });
  assert.equal(applyOperations(src, ops), '[mcp_servers.a]\ncommand = "x"\n');
});

test("quarantine is checked on the raw path before normalization", () => {
  const src = '[[skills.config]]\npath = "/safe/badfamily/../okay/SKILL.md"\nenabled = true\n';
  const doc = parseDocument(src);
  const block = doc.blocks.find((b) => b.kind === "skill");
  const normalized = parseSkillPath(doc, block);
  assert.equal(normalized, "/safe/okay/SKILL.md");
  assert.equal(skillPathContainsQuarantine(doc, block, normalized, ["badfamily"]), true);
  assert.equal(skillPathContainsQuarantine(doc, block, normalized, ["cleanfam"]), false);
});
