import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MAX_ROLLOUT_RECORD_BYTES,
  assertAllowedRoot,
  canonicalSkillEntries,
  canonicalSkills,
  consumeLines,
  derivedRolloutDay,
  forbiddenName,
  isCandidateRecordLine,
  isRolloutFile,
  scanCatalogUsage,
} from "../../scripts/lib/catalog/catalog-usage.mjs";


const line = (value) => `${JSON.stringify(value)}\n`;

test("a missing sessions root is unobserved, not evidence of non-use", async () => {
  const report = await scanCatalogUsage({
    sessionsRoot: path.join(tmpdir(), "krn-usage-missing-root-does-not-exist"),
    canonicalSkillPaths: [],
    sinceDay: "2026-01-01",
    nowMs: Date.parse("2026-01-10T00:00:00.000Z"),
  });
  assert.equal(report.scanned_files, 0);
  assert.equal(report.coverage.absence_means_unused, false);
});

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

test("an unreadable rollout file degrades to partial evidence instead of aborting", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-unreadable-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "02");
    mkdirSync(dayDirectory, { recursive: true });
    const unreadable = path.join(dayDirectory, "rollout-2026-01-02T00-00-00.jsonl");
    writeFileSync(unreadable, line({ timestamp: "2026-01-02T00:00:00.000Z", type: "response_item", payload: { type: "function_call", call_id: "c1", name: "exec" } }));
    chmodSync(unreadable, 0o000);
    const report = await scanCatalogUsage({ sessionsRoot: root, canonicalSkillPaths: [], sinceDay: "2026-01-01" });
    assert.equal(report.coverage.skipped_unreadable_files, 1);
    assert.equal(report.scanned_files, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

async function* chunks(...buffers) {
  for (const buffer of buffers) yield buffer;
}

test("consumeLines joins chunks, strips CR, and reports byte counts", async () => {
  const lines = [];
  const oversized = [];
  let bytes = 0;
  await consumeLines(
    chunks(Buffer.from("alpha\r\nbe"), Buffer.from("ta\ngamma")),
    (line) => lines.push(line.toString("utf8")),
    (count) => (bytes += count),
    (candidate) => oversized.push(candidate),
  );
  assert.deepEqual(lines, ["alpha", "beta", "gamma"]);
  assert.equal(bytes, 17);
  assert.deepEqual(oversized, []);
});

test("isCandidateRecordLine matches call markers regardless of JSON spacing", () => {
  assert.equal(isCandidateRecordLine(Buffer.from('{"type":"function_call"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from('{"type":"function_call_output"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from('{"type": "function_call"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from("plain")), false);
});

test("consumeLines flags oversized records and candidate presence", async () => {
  const candidate = [];
  await consumeLines(
    chunks(Buffer.concat([Buffer.alloc(MAX_ROLLOUT_RECORD_BYTES, 97), Buffer.from('{"type":"function_call"}\n')])),
    () => candidate.push("line"),
    () => {},
    (isCandidate) => candidate.push(isCandidate),
  );
  assert.deepEqual(candidate, [true]);

  const plain = [];
  await consumeLines(
    chunks(Buffer.concat([Buffer.alloc(MAX_ROLLOUT_RECORD_BYTES + 1, 97), Buffer.from("\n")])),
    () => plain.push("line"),
    () => {},
    (isCandidate) => plain.push(isCandidate),
  );
  assert.deepEqual(plain, [false]);
});

test("canonicalSkillEntries drops target paths that are not canonical SKILL.md paths", () => {
  const entries = canonicalSkillEntries({
    skills: [
      { id: "shared", path: "/x/shared/SKILL.md", targetPath: "/x/shared-skill.md" },
      { id: "linked", path: "/x/linked/SKILL.md", targetPath: "/x/real/SKILL.md" },
      { id: "hist", path: "/x/hist/SKILL.md", targetPath: "/x/history/SKILL.md" },
    ],
    plugins: [],
  });
  assert.deepEqual(entries, [
    { id: "shared", path: "/x/shared/SKILL.md" },
    { id: "linked", path: "/x/linked/SKILL.md" },
    { id: "linked", path: "/x/real/SKILL.md" },
    { id: "hist", path: "/x/hist/SKILL.md" },
  ]);
  assert.doesNotThrow(() => canonicalSkills(entries));
});

test("canonicalSkillEntries id acceptance matches canonicalSkills", () => {
  const ids = ["ok", "9ok", "a@b.c:d", "a".repeat(160), "a".repeat(161), "with space", "_leading", "", "a/b"];
  for (const id of ids) {
    const entries = canonicalSkillEntries({ skills: [{ id, path: `/x/${id}/SKILL.md` }], plugins: [] });
    let acceptedBySkills = true;
    try {
      canonicalSkills([{ id, path: `/x/${id}/SKILL.md` }]);
    } catch {
      acceptedBySkills = false;
    }
    assert.equal(entries.length === 1, acceptedBySkills, id);
  }
});

test("canonicalSkillEntries drops ids that canonicalSkills would reject", () => {
  const entries = canonicalSkillEntries({
    skills: [{ id: "my skill", path: "/x/my skill/SKILL.md" }],
    plugins: [{ id: "demo@my market", allSkillPaths: ["/cache/my market/demo/1.0.0/skills/alpha/SKILL.md"] }],
  });
  assert.deepEqual(entries, []);
  assert.doesNotThrow(() => canonicalSkills(entries));
});

test("canonicalSkillEntries drops non-canonical plugin and primary paths without throwing", () => {
  const entries = canonicalSkillEntries({
    skills: [{ id: "bad", path: "/x/logs/SKILL.md", targetPath: "/x/shared-skill.md" }],
    plugins: [
      {
        id: "demo@market",
        allSkillPaths: [
          "/cache/market/demo/1.0.0/skills/logs/SKILL.md",
          "/cache/market/demo/1.0.0/skills/ok/SKILL.md",
        ],
      },
    ],
  });
  assert.deepEqual(entries, [
    { id: "demo@market:ok", path: "/cache/market/demo/1.0.0/skills/ok/SKILL.md" },
  ]);
  assert.doesNotThrow(() => canonicalSkills(entries));
});

test("forbiddenName flags quarantined and private path families", () => {
  for (const name of ["superpowers", "logs", "history.jsonl", "state.db", "state.sqlite-wal"]) {
    assert.equal(forbiddenName(name), true, name);
  }
  assert.equal(forbiddenName("skills"), false);
});

test("assertAllowedRoot rejects forbidden segments", () => {
  assert.doesNotThrow(() => assertAllowedRoot("/home/u/.codex/sessions"));
  assert.throws(
    () => assertAllowedRoot("/home/u/.codex/logs/sessions"),
    /forbidden path family/,
  );
});

test("isRolloutFile matches rollout jsonl names", () => {
  assert.equal(isRolloutFile("rollout-2026-01-02T00-00-00.jsonl"), true);
  assert.equal(isRolloutFile("other.jsonl"), false);
});

test("derivedRolloutDay derives a single dated day", () => {
  const root = "/sessions";
  assert.equal(
    derivedRolloutDay(root, path.join(root, "2026", "01", "02", "rollout-2026-01-02T00-00-00.jsonl")),
    "2026-01-02",
  );
  assert.equal(
    derivedRolloutDay(root, path.join(root, "2026", "01", "02", "rollout-2026-01-03T00-00-00.jsonl")),
    null,
  );
});

test("canonicalSkills normalizes absolute SKILL.md paths", () => {
  const byPath = canonicalSkills([
    "/skills/alpha/SKILL.md",
    { id: "beta-id", path: "/skills/beta/SKILL.md" },
  ]);
  assert.equal(byPath.get(path.normalize("/skills/alpha/SKILL.md")), "alpha");
  assert.equal(byPath.get(path.normalize("/skills/beta/SKILL.md")), "beta-id");
  assert.throws(() => canonicalSkills(["relative/SKILL.md"]), /absolute SKILL.md path/);
  assert.throws(() => canonicalSkills([{ id: "bad id", path: "/skills/b/SKILL.md" }]), /safe catalog identifier/);
  assert.throws(() => canonicalSkills(["/logs/alpha/SKILL.md"]), /forbidden path family/);
});

test("canonicalSkillEntries ignores a plugin without a valid id", () => {
  const missing = canonicalSkillEntries({ skills: [], plugins: [{ allSkillPaths: ["/cache/market/demo/1.0.0/skills/alpha/SKILL.md"] }] });
  assert.deepEqual(missing, []);
  const valid = canonicalSkillEntries({ skills: [], plugins: [{ id: "demo@market", allSkillPaths: ["/cache/market/demo/1.0.0/skills/alpha/SKILL.md"] }] });
  assert.deepEqual(valid.map((entry) => entry.id), ["demo@market:alpha"]);
});
