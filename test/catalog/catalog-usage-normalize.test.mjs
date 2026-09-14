import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  dayFromMs,
  finalAggregates,
  nestedToolsForCall,
  normalizeWindow,
  normalizedCallId,
  normalizedToolId,
  recordEvidence,
  responseItem,
  skillReadsForCall,
  balancedJsonObject,
  freeformSource,
  isObject,
  literalToolCalls,
  nestedExecCommands,
  normalizeCommandPath,
  observedSkillsInShell,
  parseFlatExecLiteral,
  parseObject,
} from "../../scripts/lib/catalog/catalog-usage-normalize.mjs";

const nowMs = Date.parse("2026-01-08T00:00:00.000Z");
const skills = new Map([[path.normalize("/skills/alpha/SKILL.md"), "alpha"]]);

test("normalizeWindow resolves the default and explicit windows", () => {
  assert.deepEqual(normalizeWindow({ sinceDays: 7, nowMs }), {
    fromMs: Date.parse("2026-01-01T00:00:00.000Z"),
    source: "since_days",
    throughMs: nowMs,
    fromDay: "2026-01-01",
    throughDay: "2026-01-08",
  });
  assert.equal(normalizeWindow({ sinceDay: "2026-01-05", nowMs }).source, "since_day");
  assert.equal(normalizeWindow({ sinceMs: nowMs - 1000, nowMs }).source, "since_ms");
  assert.throws(() => normalizeWindow({ sinceDay: "2026-01-01", sinceMs: 1, nowMs }), /either sinceDay or sinceMs/);
  assert.throws(() => normalizeWindow({ sinceDay: "2026-13-40", nowMs }), /YYYY-MM-DD/);
  assert.throws(() => normalizeWindow({ sinceDay: "2026-02-01", nowMs }), /cannot begin after nowMs/);
  assert.equal(dayFromMs(nowMs), "2026-01-08");
});

test("normalized identifiers reject invalid values", () => {
  assert.equal(normalizedCallId("call_1"), "call_1");
  assert.equal(normalizedCallId("bad id"), null);
  assert.equal(normalizedToolId("functions.exec"), "functions.exec");
  assert.equal(normalizedToolId("x".repeat(200)), null);
});

test("responseItem unwraps response_item payloads", () => {
  assert.deepEqual(responseItem({ type: "response_item", payload: { type: "x" } }), { type: "x" });
  assert.deepEqual(responseItem({ type: "function_call", name: "a" }), { type: "function_call", name: "a" });
  assert.equal(responseItem({ payload: {} }), null);
});

test("skillReadsForCall observes orchestrator, exec_command, and read tool calls", () => {
  assert.deepEqual(
    [...skillReadsForCall(
      { type: "custom_tool_call", input: 'tools.exec_command({"cmd":"cat /skills/alpha/SKILL.md"})' },
      "exec",
      skills,
    )],
    [["alpha", "syntactic_only"]],
  );
  assert.deepEqual(
    [...skillReadsForCall({ arguments: JSON.stringify({ cmd: "cat /skills/alpha/SKILL.md" }) }, "exec_command", skills)],
    [["alpha", "confirmed_input"]],
  );
  assert.deepEqual(
    [...skillReadsForCall(
      { type: "custom_tool_call", input: JSON.stringify({ path: "/skills/alpha/SKILL.md" }) },
      "read_file",
      skills,
    )],
    [["alpha", "confirmed_input"]],
  );
  assert.deepEqual([...skillReadsForCall({}, "other_tool", skills)], []);
});

test("nestedToolsForCall counts literal tools and skips helpers", () => {
  assert.deepEqual(
    [...nestedToolsForCall({ input: "tools.foo({}); tools.bar({}); tools.text({})" }, "exec")],
    [["foo", 1], ["bar", 1]],
  );
  assert.deepEqual([...nestedToolsForCall({ input: "tools.foo({})" }, "other_tool")], []);
});

test("recordEvidence and finalAggregates merge, rank, and sort records", () => {
  const aggregates = new Map();
  recordEvidence(aggregates, { kind: "tool", id: "b", calls: 1, observed: 0, reads: 0, day: "2026-01-02", confidence: "confirmed" });
  recordEvidence(aggregates, { kind: "tool", id: "a", calls: 1, observed: 0, reads: 0, day: "2026-01-03", confidence: "confirmed" });
  recordEvidence(aggregates, { kind: "tool", id: "b", calls: 0, observed: 2, reads: 0, day: "2026-01-01", confidence: "syntactic_only" });
  assert.deepEqual(finalAggregates(aggregates), [
    {
      kind: "tool",
      id: "a",
      confirmed_calls: 1,
      observed_calls: 0,
      observed_reads: 0,
      last_seen_day: "2026-01-03",
      confidence: "confirmed",
      active_days: 1,
    },
    {
      kind: "tool",
      id: "b",
      confirmed_calls: 1,
      observed_calls: 2,
      observed_reads: 0,
      last_seen_day: "2026-01-02",
      confidence: "confirmed",
      active_days: 2,
    },
  ]);
});

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

test("normalizeCommandPath resolves absolute and workdir-relative candidates", () => {
  assert.equal(normalizeCommandPath("/a/b/../c", "/w"), path.normalize("/a/c"));
  assert.equal(normalizeCommandPath("skill.md", "/work"), path.resolve("/work", "skill.md"));
  assert.equal(normalizeCommandPath("skill.md", undefined), null);
  assert.equal(normalizeCommandPath("skill.md", "relative"), null);
});

test("observedSkillsInShell reads direct and nested shell commands", () => {
  const skills = new Map([[path.normalize("/skills/alpha/SKILL.md"), "alpha"]]);
  assert.deepEqual(
    [...observedSkillsInShell("cat /skills/alpha/SKILL.md", "/w", skills, "confirmed")],
    [["alpha", "confirmed"]],
  );
  assert.deepEqual(
    [...observedSkillsInShell('bash -c "grep -n foo /skills/alpha/SKILL.md"', "/w", skills, "syntactic_only")],
    [["alpha", "syntactic_only"]],
  );
});

test("observedSkillsInShell ignores non-read and malformed commands", () => {
  const skills = new Map([[path.normalize("/skills/alpha/SKILL.md"), "alpha"]]);
  assert.deepEqual([...observedSkillsInShell("cat 'unterminated", "/w", skills, "confirmed")], []);
  assert.deepEqual([...observedSkillsInShell("echo /skills/alpha/SKILL.md", "/w", skills, "confirmed")], []);
  assert.deepEqual([...observedSkillsInShell("cat relative/SKILL.md", "/w", skills, "confirmed")], []);
});

test("a heredoc body is not tokenized as commands", () => {
  const skills = new Map([["/skills/alpha/SKILL.md", "alpha"]]);
  const found = [...observedSkillsInShell("cat <<'EOF'\ncat /skills/alpha/SKILL.md\nEOF\n", "/w", skills, "confirmed")];
  assert.deepEqual(found, []);
});
