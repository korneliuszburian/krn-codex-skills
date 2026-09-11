import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gateCheck = fileURLToPath(new URL("../skills/meta/unlazy/scripts/gate-check.mjs", import.meta.url));
const extract = fileURLToPath(new URL("../skills/advisory/opencode-second-opinion/scripts/extract-final-opinion.mjs", import.meta.url));

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("gate-check reads a ledger and reports met and unmet manual gates", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-gate-"));
  try {
    const ledger = join(root, "GATES.md");
    writeFileSync(
      ledger,
      [
        "- [x] done: finished work",
        "  EVIDENCE: reviewed",
        "- [ ] open: pending work",
        "  EVIDENCE: pending",
        "- [ ] runnable: a command gate",
        "  CHECK: true",
        "  EXPECT: true",
        "  EVIDENCE: pending",
        "",
      ].join("\n"),
    );
    const status = run(gateCheck, ["--status", ledger]);
    assert.equal(status.status, 1, status.stderr);
    assert.match(status.stdout, /MET done \(manual\)/);
    assert.match(status.stdout, /UNMET open \(manual\)/);
    assert.match(status.stdout, /GATES.md: 3 gates/);
    assert.match(status.stdout, /UNMET: 2/);

    assert.match(run(gateCheck, ["--help"]).stdout, /usage: gate-check\.mjs/);

    const duplicate = join(root, "dup.md");
    writeFileSync(duplicate, "- [x] a: one\n  EVIDENCE: x\n- [x] a: two\n  EVIDENCE: y\n");
    assert.equal(run(gateCheck, ["--status", duplicate]).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate-check requires approval and rewrites the ledger on approve and reverify", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-gate-life-"));
  try {
    const ledger = join(root, "GATES.md");
    const approvals = join(root, "approvals");
    writeFileSync(
      ledger,
      ["- [ ] runnable: a command gate", "  CHECK: echo hello", "  EXPECT: hello", "  EVIDENCE: pending", ""].join("\n"),
    );

    const pending = run(gateCheck, [ledger, "--approval-dir", approvals]);
    assert.equal(pending.status, 1, pending.stderr);
    assert.match(pending.stdout, /UNMET runnable: approval pending/);

    const approved = run(gateCheck, ["--approve", ledger, "--approval-dir", approvals]);
    assert.equal(approved.status, 0, approved.stderr);
    assert.match(approved.stdout, /PASS runnable/);
    assert.match(readFileSync(ledger, "utf8"), /^- \[x\] runnable/m);
    assert.match(readFileSync(ledger, "utf8"), /EVIDENCE: exit=0/);

    const reverified = run(gateCheck, ["--reverify", ledger, "--approval-dir", approvals]);
    assert.equal(reverified.status, 0, reverified.stderr);

    const approval = readdirSync(approvals).find((name) => name.endsWith(".json"));
    const approvalPath = join(approvals, approval);
    const record = JSON.parse(readFileSync(approvalPath, "utf8"));
    record.expect = "different";
    writeFileSync(approvalPath, `${JSON.stringify(record, null, 2)}\n`);
    const mismatch = run(gateCheck, ["--reverify", ledger, "--approval-dir", approvals]);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stdout, /approval invalid: binding differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extract-final-opinion writes the terminal answer and refuses bad input", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-"));
  try {
    const target = join(root, "target");
    mkdirSync(target);
    const raw = join(root, "raw.jsonl");
    const output = join(root, "opinion.md");
    writeFileSync(
      raw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "Final answer" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [raw, output, target, "prose"]).status, 0);
    assert.equal(readFileSync(output, "utf8"), "Final answer\n");

    const empty = join(root, "empty.jsonl");
    writeFileSync(empty, `${JSON.stringify({ type: "text", part: { messageID: "m1", text: "x" } })}\n`);
    assert.equal(run(extract, [empty, output, target, "prose"]).status, 1);

    const malformed = join(root, "bad.jsonl");
    writeFileSync(malformed, "{oops\n");
    assert.equal(run(extract, [malformed, output, target, "prose"]).status, 1);

    const secret = join(root, "secret.txt");
    writeFileSync(secret, "s\n");
    const leaky = join(root, "leaky.jsonl");
    writeFileSync(
      leaky,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: `see ${secret}:1` } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    const escaped = run(extract, [leaky, output, target, "prose"]);
    assert.equal(escaped.status, 1);
    assert.match(escaped.stderr, /outside the target scope/);

    const relativeLeak = join(root, "relative.jsonl");
    writeFileSync(
      relativeLeak,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "see ../secret.txt:1" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [relativeLeak, output, target, "prose"]).status, 1);

    const jsonRaw = join(root, "json.jsonl");
    writeFileSync(
      jsonRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "verdict below\n```json\n{\"verdict\":\"ok\"}\n```" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    const jsonOutput = join(root, "opinion.json");
    assert.equal(run(extract, [jsonRaw, jsonOutput, target, "json"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(jsonOutput, "utf8")), { verdict: "ok" });

    const multiRaw = join(root, "multi.jsonl");
    writeFileSync(
      multiRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: '{"a":1} {"b":2}' } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [multiRaw, jsonOutput, target, "json"]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
