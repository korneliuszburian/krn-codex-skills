import assert from "node:assert/strict";
import test from "node:test";

import { balancedJsonObject, freeformSource, isObject, literalToolCalls, nestedExecCommands, parseFlatExecLiteral, parseObject } from "../../scripts/lib/catalog/catalog-usage-normalize.mjs";

test("parseObject accepts objects and JSON strings only", () => {
  assert.deepEqual(parseObject({ a: 1 }), { a: 1 });
  assert.deepEqual(parseObject('{"a": 1}'), { a: 1 });
  assert.equal(parseObject("not json"), null);
  assert.equal(parseObject("[1]"), null);
  assert.equal(isObject({}), true);
  assert.equal(isObject(null), false);
});

test("balancedJsonObject ignores braces inside strings", () => {
  const source = 'x {"a": "} {", "b": 2} y';
  const literal = balancedJsonObject(source, source.indexOf("{"));
  assert.equal(literal.source, '{"a": "} {", "b": 2}');
  assert.equal(source.slice(literal.end, literal.end + 1), " ");
});

test("literalToolCalls skips strings and comments and finds tool calls", () => {
  const source = '"tools.exec_command("; tools.other(); tools.exec_command({x:1})';
  assert.deepEqual(literalToolCalls(source).map((call) => call.name), ["other", "exec_command"]);
});

test("freeformSource reads input from parsed arguments", () => {
  assert.equal(freeformSource({ arguments: '{"input": "hello"}' }), "hello");
  assert.equal(freeformSource({ input: "direct" }), "direct");
  assert.equal(freeformSource({ arguments: "not-json" }), "not-json");
});

test("parseFlatExecLiteral reads cmd and workdir from both literal styles", () => {
  assert.deepEqual(parseFlatExecLiteral('{"cmd":"ls","workdir":"/tmp"}'), { cmd: "ls", workdir: "/tmp" });
  assert.deepEqual(parseFlatExecLiteral('{cmd: "ls -la", workdir: "/tmp"}'), { cmd: "ls -la", workdir: "/tmp" });
});

test("nestedExecCommands extracts exec_command literals only", () => {
  assert.deepEqual(nestedExecCommands('tools.exec_command({"cmd":"ls","workdir":"/tmp"})'), [{ cmd: "ls", workdir: "/tmp" }]);
  assert.deepEqual(nestedExecCommands('tools.other({"cmd":"ls"})'), []);
});

test("nested exec literals accept single-quoted strings", () => {
  assert.deepEqual(nestedExecCommands("tools.exec_command({cmd: 'cat /x'})"), [{ cmd: "cat /x", workdir: undefined }]);
  assert.deepEqual(nestedExecCommands("tools.exec_command({cmd: \"cat /x\"})"), [{ cmd: "cat /x", workdir: undefined }]);
  assert.deepEqual(balancedJsonObject("{cmd: '}'}", 0), { end: 10, source: "{cmd: '}'}" });
  assert.equal(nestedExecCommands("tools.exec_command({cmd: 'a'})")[0].cmd, "a");
});

test("nested exec literals decode JS escapes", () => {
  assert.equal(nestedExecCommands('tools.exec_command({cmd:"cat \\u002fskills\\u002falpha\\u002fSKILL.md"})')[0].cmd, "cat /skills/alpha/SKILL.md");
  assert.equal(nestedExecCommands('tools.exec_command({cmd:"a\\x2fb"})')[0].cmd, "a/b");
});
