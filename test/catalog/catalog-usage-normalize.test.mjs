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
