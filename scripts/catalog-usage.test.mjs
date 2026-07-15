import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MAX_ROLLOUT_RECORD_BYTES, scanCatalogUsage } from "./lib/catalog-usage.mjs";

const SECRET = "private-transcript-canary-47f9";

test("scans only correlated rollout evidence without exposing transcript text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catalog-usage-"));
  try {
    const currentDirectory = path.join(root, "2026", "07", "15");
    const oldDirectory = path.join(root, "2025", "01", "01");
    const logsDirectory = path.join(root, "logs");
    await mkdir(currentDirectory, { recursive: true });
    await mkdir(oldDirectory, { recursive: true });
    await mkdir(logsDirectory, { recursive: true });

    const implementSkill = path.join(root, "canonical", "implement", "SKILL.md");
    const typescriptSkill = path.join(root, "canonical", "typescript-engineering", "SKILL.md");
    const timestamp = "2026-07-15T09:30:00.000Z";
    const actualExecLiteral = JSON.stringify({
      cmd: `rtk rg -n "TypeScript" "${typescriptSkill}"`,
      max_output_tokens: 12_000,
      workdir: root,
      [`yield${String.fromCharCode(95)}time_ms`]: 10_000,
    });
    const lines = [
      {
        timestamp,
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call-direct",
          arguments: JSON.stringify({
            cmd: `rtk sed -n '1,40p' "${implementSkill}"`,
            workdir: root,
            padding: "chunk-boundary".repeat(6_000),
          }),
        },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-direct", output: SECRET },
      },
      {
        timestamp,
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call-near-path",
          arguments: JSON.stringify({ cmd: `rtk cat "${implementSkill}.backup"`, workdir: root }),
        },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-near-path", output: SECRET },
      },
      {
        timestamp,
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          call_id: "call-nested",
          input: [
            `const bait = ${JSON.stringify(`${SECRET} tools.string_false_positive(`)};`,
            "// tools.comment_false_positive({});",
            "/* tools.block_comment_false_positive({}); */",
            "const figma = await tools.figma__get_design_context({ nodeId: \"42\" });",
            "const gmail = await tools.gmail__search_messages({ query: \"newer_than:7d\" });",
            "const github = await tools.github__get_pull_request({ number: 7 });",
            "tools.text(\"local helper\");",
            `const r = await tools.exec_command(${actualExecLiteral});`,
            "text(r.output);",
          ].join("\n"),
        },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "custom_tool_call_output", call_id: "call-nested", output: SECRET },
      },
      {
        timestamp,
        type: "response_item",
        payload: {
          type: "function_call",
          name: "unconfirmed_tool",
          call_id: "call-without-output",
          arguments: JSON.stringify({ value: SECRET }),
        },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "text", text: SECRET }] },
      },
    ];
    const largeIrrelevantMalformedLine = `{\\"type\\":\\"function_call\\"${"irrelevant ".repeat(64 * 1_024)}${SECRET}`;
    const oversizedIrrelevantLine = `irrelevant-${"i".repeat(MAX_ROLLOUT_RECORD_BYTES)}-${SECRET}`;
    const oversizedCandidateLine = `{"type":"function_call","padding":"${"c".repeat(MAX_ROLLOUT_RECORD_BYTES)}","private":"${SECRET}"}`;
    const malformedCandidateLine = `{"type":"function_call", malformed ${SECRET}`;
    const rolloutText = [
      ...lines.map((line) => JSON.stringify(line)),
      largeIrrelevantMalformedLine,
      oversizedIrrelevantLine,
      oversizedCandidateLine,
      malformedCandidateLine,
      "",
    ].join("\r\n");
    await writeFile(path.join(currentDirectory, "rollout-2026-07-15T09-30-00.jsonl"), rolloutText);
    await writeFile(
      path.join(oldDirectory, "rollout-2025-01-01T00-00-00.jsonl"),
      `${JSON.stringify({ timestamp: "2025-01-01T00:00:00.000Z", type: "response_item", payload: { type: "function_call", name: SECRET, call_id: "old" } })}\n`,
    );
    await writeFile(path.join(logsDirectory, "rollout-2026-07-15T00-00-00.jsonl"), SECRET);
    await writeFile(path.join(root, "history.jsonl"), SECRET);

    const result = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [
        { id: "implement", path: implementSkill },
        { id: "typescript-engineering@global", path: typescriptSkill },
      ],
      sinceDay: "2026-07-01",
      nowMs: Date.parse("2026-07-31T23:59:59.999Z"),
    });

    assert.deepEqual(result.aggregates, [
      {
        kind: "nested_tool",
        id: "exec_command",
        confirmed_calls: 0,
        observed_calls: 1,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "syntactic_only",
        active_days: 1,
      },
      {
        kind: "nested_tool",
        id: "figma__get_design_context",
        confirmed_calls: 0,
        observed_calls: 1,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "syntactic_only",
        active_days: 1,
      },
      {
        kind: "nested_tool",
        id: "github__get_pull_request",
        confirmed_calls: 0,
        observed_calls: 1,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "syntactic_only",
        active_days: 1,
      },
      {
        kind: "nested_tool",
        id: "gmail__search_messages",
        confirmed_calls: 0,
        observed_calls: 1,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "syntactic_only",
        active_days: 1,
      },
      {
        kind: "skill",
        id: "implement",
        confirmed_calls: 0,
        observed_calls: 0,
        observed_reads: 1,
        last_seen_day: "2026-07-15",
        confidence: "confirmed_input",
        active_days: 1,
      },
      {
        kind: "skill",
        id: "typescript-engineering@global",
        confirmed_calls: 0,
        observed_calls: 0,
        observed_reads: 1,
        last_seen_day: "2026-07-15",
        confidence: "syntactic_only",
        active_days: 1,
      },
      {
        kind: "tool",
        id: "exec",
        confirmed_calls: 1,
        observed_calls: 0,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "confirmed",
        active_days: 1,
      },
      {
        kind: "tool",
        id: "exec_command",
        confirmed_calls: 2,
        observed_calls: 0,
        observed_reads: 0,
        last_seen_day: "2026-07-15",
        confidence: "confirmed",
        active_days: 1,
      },
    ]);
    assert.equal(result.scanned_files, 1);
    assert.equal(result.scanned_bytes, Buffer.byteLength(rolloutText));
    assert.equal(result.malformed_lines, 1);
    assert.equal(result.coverage.skipped_files_before_window, 1);
    assert.equal(result.coverage.undated_rollout_files_scanned, 0);
    assert.equal(result.coverage.max_record_bytes, MAX_ROLLOUT_RECORD_BYTES);
    assert.equal(result.coverage.oversized_lines, 2);
    assert.equal(result.coverage.oversized_candidate_lines, 1);
    assert.equal(result.coverage.absence_means_unused, false);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an intermediate symlink before scanning a sessions root", async (context) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "catalog-usage-root-"));
  context.after(async () => rm(fixture, { recursive: true, force: true }));

  const hiddenParent = path.join(fixture, "history");
  const actualSessions = path.join(hiddenParent, "sessions");
  const safeAlias = path.join(fixture, "safe-sessions-alias");
  await mkdir(actualSessions, { recursive: true });
  await writeFile(
    path.join(actualSessions, "rollout-2026-07-15T00-00-00.jsonl"),
    "{}\n",
  );
  await symlink(hiddenParent, safeAlias);

  await assert.rejects(
    () =>
      scanCatalogUsage({
        sessionsRoot: path.join(safeAlias, "sessions"),
        canonicalSkillPaths: [],
        sinceDay: "2026-07-01",
        nowMs: Date.parse("2026-07-31T23:59:59.999Z"),
      }),
    /sessionsRoot must not be a symlink/,
  );
});
