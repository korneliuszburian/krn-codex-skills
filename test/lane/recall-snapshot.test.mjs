import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const LANE = join(root, "scripts", "lane", "run-ticket.sh");

const STUB = `
import { appendFileSync } from "node:fs";
const scenario = process.env.KRN_STUB_SCENARIO ?? "ok-empty";
if (process.env.KRN_STUB_COUNTER) appendFileSync(process.env.KRN_STUB_COUNTER, "call\\n");
const hit = { lesson: "Guards", trigger: "path:scripts/lib/x.mjs", gate: "\`test:lessons\`", falsifier: "", matched: ["scripts/lib/x.mjs"] };
if (scenario === "ok-empty") { process.stdout.write(JSON.stringify({ hits: [] })); process.exit(0); }
if (scenario === "ok-hit") { process.stdout.write(JSON.stringify({ hits: [hit] })); process.exit(0); }
if (scenario === "fail-sentinel") { process.stderr.write("stub: recall backend unavailable\\n"); process.exit(73); }
if (scenario === "fail-with-json") { process.stdout.write('{"hits":[]}'); process.stderr.write("stub: exploded\\n"); process.exit(73); }
if (scenario === "malformed") { process.stdout.write("not json\\n"); process.exit(0); }
if (scenario === "wrong-shape") { process.stdout.write('{"hits":{}}\\n'); process.exit(0); }
process.exit(0);
`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "krn-recall-snapshot-"));
  const stub = join(dir, "stub.mjs");
  writeFileSync(stub, STUB);
  return dir;
}

function runSnapshot(dir, scenario) {
  const stub = join(dir, "stub.mjs");
  const out = join(dir, "out", "recall.json");
  const counter = join(dir, "calls.txt");
  const result = spawnSync("bash", [LANE, "recall-snapshot", stub, dir, "scripts/lib/x.mjs", out], {
    cwd: dir,
    encoding: "utf8",
    // Pin the lane inputs so a script without the snapshot dispatch fails on an
    // assertion, not on a missing module or an empty environment.
    env: { ...process.env, KRN: stub, BASE: dir, FIXTURE: dir, KRN_STUB_SCENARIO: scenario, KRN_STUB_COUNTER: counter },
  });
  let json = null;
  try {
    json = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    json = null;
  }
  let calls = 0;
  try {
    calls = readFileSync(counter, "utf8").split("\n").filter(Boolean).length;
  } catch {
    calls = 0;
  }
  return { ...result, json, calls };
}

test("a read source with zero hits is an explicit zero from one observation", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "ok-empty");
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /no recalled lessons/, "the zero state must be explicit");
    assert.deepEqual(result.json, { hits: [] });
    assert.equal(result.calls, 1, "the brief and the trailers must come from one recall observation");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hit yields one observation for both the brief and the trailer input", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "ok-hit");
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Guards/, "the brief must name the matching lesson");
    assert.equal(result.json?.hits?.[0]?.lesson, "Guards");
    assert.equal(result.calls, 1, "the brief and the trailers must come from one recall observation");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed recall is a failure with preserved diagnostics, never an empty success", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "fail-sentinel");
    assert.notEqual(result.status, 0, `a failed recall must stop the lane:\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /stub: recall backend unavailable/, "the diagnostic must survive");
    assert.doesNotMatch(result.stdout, /no recalled lessons/, "a failure must not render as an empty source");
    assert.equal(result.json, null, "a failed recall must not publish a default hits document");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a valid JSON body on a failed process is still a failure", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "fail-with-json");
    assert.notEqual(result.status, 0, `a nonzero recall process must win over its stdout:\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /stub: exploded/);
    assert.doesNotMatch(result.stdout, /"hits"/, "the fallback body must not be surfaced as a success");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed recall JSON is a failure, not a default zero", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "malformed");
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /invalid/i);
    assert.doesNotMatch(result.stdout, /no recalled lessons/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a wrong recall response shape is a failure", () => {
  const dir = fixture();
  try {
    const result = runSnapshot(dir, "wrong-shape");
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /invalid/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the lane wiring uses the snapshot, guards it, and keeps no fallback path", () => {
  const text = readFileSync(LANE, "utf8");
  assert.ok(/recall-snapshot\)/.test(text), "the lane must expose the snapshot seam");
  assert.ok(/if ! recall=\$\(snapshot_recall/.test(text), "the snapshot must be guarded before the worker");
  assert.ok(/lane refused: rule=recall-snapshot-failed/.test(text), "a failed snapshot must refuse the lane");
  assert.ok(!/\|\|\s*echo 'no recalled lessons'/.test(text), "the empty-success fallback must be gone");
  assert.ok(!/\|\|\s*echo '\{"hits":\[\]\}'/.test(text), "the empty-success fallback must be gone");
  const guard = text.indexOf("rule=recall-snapshot-failed");
  const worker = text.indexOf("invoke_worker");
  assert.ok(guard !== -1 && worker !== -1 && guard < worker, "the refusal must precede the worker invocation");
});
