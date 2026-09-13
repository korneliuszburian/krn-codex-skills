import assert from "node:assert/strict";
import test from "node:test";

import {
  directAssignments,
  parseAssignment,
  parseDocument,
  parseDottedHeaderKey,
  parseHeader,
  parseTomlString,
  splitHeader,
  splitLines,
} from "../../scripts/lib/catalog/catalog-toml.mjs";

test("splitLines keeps raw, content, eol, and offsets", () => {
  const lines = splitLines("a\nb\r\nc");
  assert.deepEqual(
    lines.map(({ content, eol }) => ({ content, eol })),
    [
      { content: "a", eol: "\n" },
      { content: "b", eol: "\r\n" },
      { content: "c", eol: "" },
    ],
  );
  assert.equal(lines[0].start, 0);
  assert.equal(lines[1].start, 2);
});

test("parseTomlString decodes literals and rejects invalid strings", () => {
  assert.equal(parseTomlString("'literal'", "x"), "literal");
  assert.equal(parseTomlString('"escaped\\n"', "x"), "escaped\n");
  assert.throws(() => parseTomlString('"unterminated', "x"), /Invalid TOML string for x/);
});

test("splitHeader distinguishes tables, arrays, and tails", () => {
  assert.deepEqual(splitHeader("[mcp_servers.demo]"), {
    array: false,
    inner: "mcp_servers.demo",
    validTail: true,
  });
  assert.deepEqual(splitHeader('[[skills.config]] # note'), {
    array: true,
    inner: "skills.config",
    validTail: true,
  });
  assert.equal(splitHeader("[broken").validTail, false);
  assert.equal(splitHeader("not a header"), undefined);
});

test("parseDottedHeaderKey parses quoted and bare segments", () => {
  assert.deepEqual(parseDottedHeaderKey('plugins."my.id"'), ["plugins", "my.id"]);
  assert.deepEqual(parseDottedHeaderKey("mcp_servers.demo"), ["mcp_servers", "demo"]);
  assert.equal(parseDottedHeaderKey("a."), undefined);
});

test("parseHeader classifies managed tables", () => {
  assert.deepEqual(parseHeader("[plugins.demo]"), { kind: "plugin", id: "demo" });
  assert.deepEqual(parseHeader("[mcp_servers.demo]"), { kind: "mcp", id: "demo" });
  assert.deepEqual(parseHeader("[[skills.config]]"), { kind: "skill" });
  assert.deepEqual(parseHeader("[other.thing]"), { kind: "other" });
  assert.throws(() => parseHeader("[plugins]"), /Ambiguous managed TOML table header/);
});

test("parseDocument builds blocks and rejects managed root assignments", () => {
  const source = "[mcp_servers.demo]\nenabled = true\n\n[other]\nx = 1\n";
  const document = parseDocument(source);
  assert.equal(document.eol, "\n");
  assert.deepEqual(
    document.blocks.map(({ kind, id, startLineIndex, endLineIndex }) => ({ kind, id, startLineIndex, endLineIndex })),
    [
      { kind: "mcp", id: "demo", startLineIndex: 0, endLineIndex: 3 },
      { kind: "other", id: undefined, startLineIndex: 3, endLineIndex: 5 },
    ],
  );
  assert.deepEqual([...directAssignments(document, document.blocks[0]).keys()], ["enabled"]);
  assert.throws(() => parseDocument("mcp_servers = 1\n"), /Managed TOML owners must use supported table syntax/);
});

test("parseDocument ignores managed-looking headers inside multi-line strings", () => {
  const basic = 'developer_instructions = """\n[plugins."remember@x"]\nenabled = true\n"""\n\n[plugins.real]\nenabled = true\n';
  assert.deepEqual(parseDocument(basic).blocks.map(({ kind, id }) => ({ kind, id })), [{ kind: "plugin", id: "real" }]);
  const literal = "notes = '''\n[mcp_servers.demo]\nenabled = true\n'''\n";
  assert.deepEqual(parseDocument(literal).blocks, []);
  const sameLineOpenClose = 'help = """[skills.config]\npath = "x" """\n[mcp_servers.after]\n';
  assert.deepEqual(parseDocument(sameLineOpenClose).blocks.map(({ kind, id }) => ({ kind, id })), [{ kind: "mcp", id: "after" }]);
});

test("parseAssignment reads key, prefix, and value", () => {
  assert.deepEqual(parseAssignment("  enabled = true # note"), {
    key: "enabled",
    prefix: "  enabled = ",
    value: "true # note",
  });
  assert.equal(parseAssignment("# comment"), undefined);
});
