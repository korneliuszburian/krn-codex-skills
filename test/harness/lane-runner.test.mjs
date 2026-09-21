import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadTask } from "../../scripts/lib/harness/e2e-compare.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CLI = path.join(root, "scripts", "krn.mjs");
const ADAPTER = path.join(root, "scripts", "harness", "lane-runner.mjs");

const AGENT = [
  'import fs from "node:fs";',
  'let raw = "";',
  'try { raw = fs.readFileSync(0, "utf8"); } catch {}',
  "const payload = JSON.parse(raw || \"{}\");",
  'if (payload.enabled?.skills) fs.writeFileSync("skills.txt", "on\\n");',
  'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
].join("\n");

const CHECK = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  'import test from "node:test";',
  'test("the agent enabled the skill component", () => {',
  '  assert.ok(fs.existsSync("skills.txt"), "skills.txt must exist");',
  "});",
].join("\n");

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-lane-runner-"));
  writeFileSync(path.join(dir, "agent.mjs"), AGENT);
  writeFileSync(path.join(dir, "check.test.mjs"), CHECK);
  writeFileSync(
    path.join(dir, "task.md"),
    `# Harness task\n\n\`\`\`krn-harness-task\n${JSON.stringify({ id: "fixture", prompt: "enable the skill", check: "node check.test.mjs", workspace: ".", setup: "" })}\n\`\`\`\n`,
  );
  return dir;
}

const env = (extra = {}) => ({
  ...process.env,
  KRN_HARNESS_LANE_RUNNER: ADAPTER,
  KRN_HARNESS_AGENT: "node agent.mjs",
  ...extra,
});

test("the harness task carries its workspace and setup", () => {
  const dir = fixture();
  try {
    const task = loadTask(path.join(dir, "task.md"));
    assert.equal(task.workspace, ".");
    assert.equal(task.setup, "");
    assert.equal(task.check, "node check.test.mjs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the lane runner refuses a missing agent or check", () => {
  assert.ok(existsSync(ADAPTER), "scripts/harness/lane-runner.mjs must exist");
  const dir = fixture();
  try {
    const withoutAgent = { ...env(), KRN_HARNESS_AGENT: "" };
    const agentRefusal = spawnSync(process.execPath, [ADAPTER], {
      input: JSON.stringify({ lane: "full", enabled: {}, task: { id: "x", check: "true" }, root: dir }),
      encoding: "utf8",
      env: withoutAgent,
    });
    assert.equal(agentRefusal.status, 2);
    assert.match(agentRefusal.stderr, /agent-missing/);

    const checkRefusal = spawnSync(process.execPath, [ADAPTER], {
      input: JSON.stringify({ lane: "full", enabled: {}, task: { id: "x" }, root: dir }),
      encoding: "utf8",
      env: env(),
    });
    assert.equal(checkRefusal.status, 2);
    assert.match(checkRefusal.stderr, /missing-check/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the fixture lanes separate vanilla from full with a detectable delta", () => {
  assert.ok(existsSync(ADAPTER), "scripts/harness/lane-runner.mjs must exist");
  const dir = fixture();
  try {
    const result = spawnSync(
      process.execPath,
      [CLI, "harness", "compare", "--task", path.join(dir, "task.md"), "--lanes", "vanilla,full", "--runs", "2", "--root", dir, "--json"],
      { encoding: "utf8", env: env(), cwd: root },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const lane = (name) => report.lanes.find((entry) => entry.lane === name);
    assert.equal(lane("vanilla").passes, 0, JSON.stringify(report));
    assert.equal(lane("full").passes, 2, JSON.stringify(report));
    assert.equal(report.delta.full.passRate, 1, JSON.stringify(report));
    assert.equal(lane("full").tokens, 14, JSON.stringify(report));
    // The wall clock is reported in tenths of a second, so a fast fixture
    // legitimately rounds to zero; only its shape is asserted here.
    assert.equal(typeof lane("full").wallSeconds, "number", JSON.stringify(report));
    assert.ok(lane("full").wallSeconds >= 0, JSON.stringify(report));
    assert.equal(report.note, "detectable-delta", JSON.stringify(report));
    assert.ok(!existsSync(path.join(dir, "skills.txt")), "the source workspace must stay untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const HIDDEN_AGENT = [
  'import fs from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import path from "node:path";',
  'let raw = "";',
  'try { raw = fs.readFileSync(0, "utf8"); } catch {}',
  "JSON.parse(raw || \"{}\");",
  'fs.writeFileSync("seen.txt", String(fs.existsSync("check.test.mjs")));',
  'const found = fs.readdirSync(tmpdir()).filter((name) => name.startsWith("krn-harness-hidden-") && fs.existsSync(path.join(tmpdir(), name, "check.test.mjs")));',
  'fs.writeFileSync("found.txt", JSON.stringify(found));',
  'process.stdout.write(`${JSON.stringify({ tokens: 3 })}\\n`);',
].join("\n");

const HIDDEN_CHECK = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  'import test from "node:test";',
  'test("the check was hidden from the agent", () => {',
  '  assert.equal(fs.readFileSync("seen.txt", "utf8"), "false", "the deciding check must be absent during the agent run");',
  '  assert.equal(fs.readFileSync("found.txt", "utf8"), "[]", "no on-disk copy of the check may exist under tmpdir during the agent run");',
  "});",
].join("\n");

test("the lane runner hides a declared check from the agent and restores it for scoring", () => {
  assert.ok(existsSync(ADAPTER), "scripts/harness/lane-runner.mjs must exist");
  const dir = mkdtempSync(path.join(tmpdir(), "krn-lane-hidden-"));
  try {
    writeFileSync(path.join(dir, "agent.mjs"), HIDDEN_AGENT);
    writeFileSync(path.join(dir, "check.test.mjs"), HIDDEN_CHECK);
    const task = { id: "hidden", check: "node check.test.mjs", workspace: ".", hidden: ["check.test.mjs"] };
    const result = spawnSync(process.execPath, [ADAPTER], {
      input: JSON.stringify({ lane: "full", enabled: {}, task, root: dir }),
      encoding: "utf8",
      env: env(),
      cwd: dir,
    });
    assert.equal(result.status, 0, result.stderr);
    const line = result.stdout.trim().split("\n").filter(Boolean).at(-1);
    assert.equal(JSON.parse(line).pass, true, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
