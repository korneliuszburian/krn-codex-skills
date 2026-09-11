import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MAX_ROLLOUT_RECORD_BYTES, scanCatalogUsage } from "../scripts/lib/catalog-usage.mjs";

const line = (value) => `${JSON.stringify(value)}\n`;

test("scanCatalogUsage reads dated rollout evidence end to end", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "02");
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(
      path.join(dayDirectory, "rollout-2026-01-02T00-00-00.jsonl"),
      line({
        timestamp: "2026-01-02T00:00:00.000Z",
        type: "response_item",
        payload: { type: "function_call", call_id: "c1", name: "exec" },
      }) +
        line({
          timestamp: "2026-01-02T00:00:01.000Z",
          type: "response_item",
          payload: { type: "function_call_output", call_id: "c1" },
        }),
    );

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-01",
    });

    assert.equal(report.scanned_files, 1);
    assert.deepEqual(
      report.aggregates.map(({ kind, id, confirmed_calls, confidence }) => ({
        kind,
        id,
        confirmed_calls,
        confidence,
      })),
      [{ kind: "tool", id: "exec", confirmed_calls: 1, confidence: "confirmed" }],
    );
    assert.equal(report.coverage.source, "since_day");
    assert.equal(report.coverage.absence_means_unused, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const call = (callId, name = "exec") =>
  line({ type: "response_item", payload: { type: "function_call", call_id: callId, name } });
const output = (callId) =>
  line({ type: "response_item", payload: { type: "function_call_output", call_id: callId } });

test("scanCatalogUsage reports window skips, undated files, and malformed candidate lines", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-branches-")));
  try {
    const before = path.join(root, "2026", "01", "02");
    const after = path.join(root, "2026", "01", "12");
    const inside = path.join(root, "2026", "01", "06");
    mkdirSync(before, { recursive: true });
    mkdirSync(after, { recursive: true });
    mkdirSync(inside, { recursive: true });
    writeFileSync(path.join(before, "rollout-2026-01-02T00-00-00.jsonl"), call("b1") + output("b1"));
    writeFileSync(path.join(after, "rollout-2026-01-12T00-00-00.jsonl"), call("a1") + output("a1"));
    writeFileSync(
      path.join(inside, "rollout-2026-01-06T00-00-00.jsonl"),
      line({
        timestamp: "2026-01-06T00:00:00.000Z",
        type: "response_item",
        payload: { type: "function_call", call_id: "c1", name: "exec" },
      }) +
        line({
          timestamp: "2026-01-06T00:00:01.000Z",
          type: "response_item",
          payload: { type: "function_call_output", call_id: "c1" },
        }) +
        '{"type":"function_call"\n',
    );
    writeFileSync(path.join(root, "rollout-undated.jsonl"), call("u1") + output("u1"));

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-05",
      nowMs: Date.parse("2026-01-10T00:00:00.000Z"),
    });

    assert.equal(report.scanned_files, 2);
    assert.equal(report.malformed_lines, 1);
    assert.deepEqual(report.aggregates.map(({ id, confirmed_calls }) => ({ id, confirmed_calls })), [
      { id: "exec", confirmed_calls: 1 },
    ]);
    assert.equal(report.coverage.skipped_files_before_window, 1);
    assert.equal(report.coverage.skipped_files_after_window, 1);
    assert.equal(report.coverage.undated_rollout_files_scanned, 1);
    assert.equal(report.coverage.records_without_usable_date, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanCatalogUsage skips symlinked and forbidden rollout entries", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-skip-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "06");
    mkdirSync(dayDirectory, { recursive: true });
    const inside = path.join(dayDirectory, "rollout-2026-01-06T00-00-00.jsonl");
    writeFileSync(
      inside,
      line({
        timestamp: "2026-01-06T00:00:00.000Z",
        type: "response_item",
        payload: { type: "function_call", call_id: "c1", name: "exec" },
      }) +
        line({
          timestamp: "2026-01-06T00:00:01.000Z",
          type: "response_item",
          payload: { type: "function_call_output", call_id: "c1" },
        }),
    );
    symlinkSync(inside, path.join(root, "rollout-copy.jsonl"));
    const forbidden = path.join(root, "logs", "2026", "01", "06");
    mkdirSync(forbidden, { recursive: true });
    writeFileSync(path.join(forbidden, "rollout-2026-01-06T00-00-00.jsonl"), call("z1") + output("z1"));

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-01",
    });

    assert.equal(report.scanned_files, 1);
    assert.deepEqual(report.aggregates.map(({ id, confirmed_calls }) => ({ id, confirmed_calls })), [
      { id: "exec", confirmed_calls: 1 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanCatalogUsage reports skill reads from canonical paths", async () => {
  const run = async (build) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-skills-")));
    try {
      const skillPath = path.join(root, "skills", "alpha", "SKILL.md");
      const dayDirectory = path.join(root, "2026", "01", "06");
      mkdirSync(dayDirectory, { recursive: true });
      writeFileSync(
        path.join(dayDirectory, "rollout-2026-01-06T00-00-00.jsonl"),
        build(skillPath).map((record) => line(record)).join(""),
      );
      const report = await scanCatalogUsage({
        sessionsRoot: root,
        canonicalSkillPaths: [{ id: "alpha", path: skillPath }],
        sinceDay: "2026-01-01",
      });
      return report.aggregates
        .filter(({ kind }) => kind === "skill")
        .map(({ id, observed_reads, confidence }) => ({ id, observed_reads, confidence }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const payload = (callId, extra) => ({
    timestamp: "2026-01-06T00:00:00.000Z",
    type: "response_item",
    payload: { call_id: callId, ...extra },
  });
  const output = (callId, type) =>
    payload(callId, { type, call_id: callId });

  assert.deepEqual(
    await run((skillPath) => [
      payload("c1", {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: `cat ${skillPath}` }),
      }),
      output("c1", "function_call_output"),
    ]),
    [{ id: "alpha", observed_reads: 1, confidence: "confirmed_input" }],
  );

  assert.deepEqual(
    await run((skillPath) => [
      payload("c2", {
        type: "custom_tool_call",
        name: "exec",
        input: `tools.exec_command({"cmd":"cat ${skillPath}"})`,
      }),
      output("c2", "custom_tool_call_output"),
    ]),
    [{ id: "alpha", observed_reads: 1, confidence: "syntactic_only" }],
  );

  const mergedRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-skills-")));
  try {
    const skillPath = path.join(mergedRoot, "skills", "alpha", "SKILL.md");
    const dayDirectory = path.join(mergedRoot, "2026", "01", "06");
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(
      path.join(dayDirectory, "rollout-2026-01-06T00-00-00.jsonl"),
      line(payload("c3", {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: `cat ${skillPath}` }),
      })) +
        line(output("c3", "function_call_output")) +
        line(payload("c4", {
          type: "custom_tool_call",
          name: "exec",
          input: `tools.exec_command({"cmd":"cat ${skillPath}"})`,
        })) +
        line(output("c4", "custom_tool_call_output")),
    );
    const report = await scanCatalogUsage({
      sessionsRoot: mergedRoot,
      canonicalSkillPaths: [{ id: "alpha", path: skillPath }],
      sinceDay: "2026-01-01",
    });
    assert.deepEqual(
      report.aggregates
        .filter(({ kind }) => kind === "skill")
        .map(({ id, observed_reads, confidence }) => ({ id, observed_reads, confidence })),
      [{ id: "alpha", observed_reads: 2, confidence: "confirmed_input" }],
    );
  } finally {
    rmSync(mergedRoot, { recursive: true, force: true });
  }
});

test("scanCatalogUsage dedupes call ids and ignores mismatched outputs", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-pending-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "06");
    mkdirSync(dayDirectory, { recursive: true });
    const at = (seconds, payload) =>
      line({ timestamp: `2026-01-06T00:00:0${seconds}.000Z`, type: "response_item", payload });
    writeFileSync(
      path.join(dayDirectory, "rollout-2026-01-06T00-00-00.jsonl"),
      at(0, { type: "function_call", call_id: "c1", name: "exec" }) +
        at(1, { type: "function_call", call_id: "c1", name: "exec" }) +
        at(2, { type: "function_call", call_id: "c2", name: "exec" }) +
        at(3, { type: "custom_tool_call_output", call_id: "c2" }) +
        at(4, { type: "function_call_output", call_id: "c1" }),
    );

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-01",
    });

    assert.deepEqual(
      report.aggregates.map(({ kind, id, confirmed_calls }) => ({ kind, id, confirmed_calls })),
      [{ kind: "tool", id: "exec", confirmed_calls: 1 }],
    );
    assert.equal(report.coverage.records_without_usable_date, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanCatalogUsage counts oversized candidate records without parsing them", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-oversize-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "06");
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(
      path.join(dayDirectory, "rollout-2026-01-06T00-00-00.jsonl"),
      Buffer.concat([
        Buffer.alloc(MAX_ROLLOUT_RECORD_BYTES, 97),
        Buffer.from('"type":"function_call"}\n'),
      ]),
    );

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-01",
    });

    assert.equal(report.scanned_files, 1);
    assert.equal(report.coverage.oversized_lines, 1);
    assert.equal(report.coverage.oversized_candidate_lines, 1);
    assert.deepEqual(report.aggregates, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
