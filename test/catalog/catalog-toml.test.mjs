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
  assert.deepEqual(parseHeader("[plugins]"), { kind: "other" });
});

test("parseHeader leaves plugin sub-tables and bare owner tables unmanaged", () => {
  assert.deepEqual(parseHeader('[plugins."sample@test".mcp_servers.sample]'), { kind: "other" });
  assert.deepEqual(parseHeader("[plugins.a.b]"), { kind: "other" });
  assert.deepEqual(parseHeader("[mcp_servers]"), { kind: "other" });
  assert.throws(() => parseHeader('[[plugins."x"]]'), /Ambiguous managed TOML table header/);
  assert.throws(() => parseHeader("[[mcp_servers.foo]]"), /Ambiguous managed TOML table header/);
});

test("directAssignments reads dotted keys so an unknown managed key is rejected", () => {
  const document = parseDocument('[plugins."x"]\nenabled.x = true\n');
  const block = document.blocks.find((entry) => entry.kind === "plugin");
  assert.deepEqual([...directAssignments(document, block).keys()], ["enabled.x"]);
});

test("a nested array element is not a phantom table header", () => {
  const source = '[mcp_servers.demo]\ncommand = "npx"\nargs = [\n  ["-y"],\n]\nenabled = false\n';
  const doc = parseDocument(source);
  const mcp = doc.blocks.filter((block) => block.kind === "mcp");
  assert.equal(mcp.length, 1, JSON.stringify(doc.blocks.map((block) => block.kind)));
  assert.deepEqual([...directAssignments(doc, mcp[0]).keys()], ["command", "args", "enabled"]);
});

test("an assignment-shaped array element is not a real assignment", () => {
  const source = '[mcp_servers.demo]\ncommand = "npx"\nargs = [\n  x = 1,\n]\nenabled = false\n';
  const doc = parseDocument(source);
  const mcp = doc.blocks.find((block) => block.kind === "mcp");
  assert.ok(![...directAssignments(doc, mcp).keys()].includes("x"), JSON.stringify([...directAssignments(doc, mcp).keys()]));
});

test("a four-quote multi-line string ending does not hide a later assignment", () => {
  const source = '[mcp_servers.demo]\nargs = ["""hello""""]\nenabled = true\n';
  const doc = parseDocument(source);
  const mcp = doc.blocks.find((block) => block.kind === "mcp");
  assert.deepEqual([...directAssignments(doc, mcp).keys()], ["args", "enabled"]);
});

test("parseTomlString decodes TOML escapes", () => {
  assert.equal(parseTomlString('"\\U00000068ooks"', "key"), "hooks");
  assert.equal(parseTomlString('"\\u0068i"', "key"), "hi");
  assert.equal(parseTomlString('"a\\tb\\n\\"c\\\\d"', "key"), 'a\tb\n"c\\d');
  assert.equal(parseTomlString("'literal\\n'", "key"), "literal\\n");
  assert.throws(() => parseTomlString('"\\q"', "key"), /Invalid TOML string/);
  assert.throws(() => parseTomlString('"\\u006"', "key"), /Invalid TOML string/);
});

test("a bracket inside a multi-line string body is not a structural bracket", () => {
  const source = "note = '''it's [draft\n'''\n[features]\nhooks = false\n";
  const doc = parseDocument(source);
  assert.ok(doc.blocks.some((block) => block.kind === "other"), JSON.stringify(doc.blocks));
  assert.deepEqual([...directAssignments(doc, doc.blocks.at(-1)).keys()], ["hooks"]);
});

test("a close-then-reopen multi-line string does not inflate array depth", () => {
  const source = 'a = [\n"""x\ny""", """it"s [z"""\n]\n[features]\nhooks = false\n';
  const doc = parseDocument(source);
  assert.deepEqual(doc.blocks.map((block) => block.kind), ["other"]);
  assert.deepEqual([...directAssignments(doc, doc.blocks[0]).keys()], ["hooks"]);
});

test("an escaped delimiter inside a multi-line string does not inflate array depth", () => {
  const source = `[mcp_servers.alpha]\ncommand = """\nescaped \\""" [x\n"""\nenabled = false\n`;
  const doc = parseDocument(source);
  const mcp = doc.blocks.find((block) => block.kind === "mcp");
  assert.deepEqual([...directAssignments(doc, mcp).keys()], ["command", "enabled"]);
});

test("a fully quoted dotted root key is not a managed assignment", () => {
  assert.doesNotThrow(() => parseDocument('"plugins.x" = 1\n'));
  assert.throws(() => parseDocument("plugins.x = 1\n"), /Managed TOML owners must use supported table syntax/);
});

test("directAssignments ignores multi-line array elements", () => {
  const source = '[mcp_servers.context7]\ncommand = "npx"\nargs = [\n    "-y",\n    "--transport=stdio",\n]\nenabled = false\n';
  const document = parseDocument(source);
  const block = document.blocks.find((entry) => entry.kind === "mcp");
  assert.deepEqual([...directAssignments(document, block).keys()], ["command", "args", "enabled"]);
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
  const sameLineOpenClose = 'help = """[mcp_servers.fake]\n[skills.config]\n"""\n[mcp_servers.after]\n';
  assert.deepEqual(parseDocument(sameLineOpenClose).blocks.map(({ kind, id }) => ({ kind, id })), [{ kind: "mcp", id: "after" }]);
});

test("directAssignments ignores assignment-looking lines inside a multi-line string", () => {
  const source = '[mcp_servers.demo]\ncommand = """\n[mcp_servers.demo]\nenabled = true\n"""\n';
  const document = parseDocument(source);
  const block = document.blocks.find((entry) => entry.kind === "mcp");
  assert.deepEqual([...directAssignments(document, block).keys()], ["command"]);
});

test("parseAssignment reads key, prefix, and value", () => {
  assert.deepEqual(parseAssignment("  enabled = true # note"), {
    key: "enabled",
    prefix: "  enabled = ",
    value: "true # note",
  });
  assert.equal(parseAssignment("# comment"), undefined);
});
