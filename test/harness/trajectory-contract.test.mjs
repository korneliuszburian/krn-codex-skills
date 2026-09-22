import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const RUNNER = path.join(root, "scripts", "harness", "trajectory-runner.mjs");

// The runner drives a workspace that persists across steps. Each step's own
// check earns an obligation, and every still-applicable obligation is re-checked
// after every later step; the checks live outside the workspace while the agent
// runs, so the agent is scored by an evaluator it cannot read.
const AGENT_LOSSY = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  'let raw = "";',
  'try { raw = fs.readFileSync(0, "utf8"); } catch {}',
  'const { step } = JSON.parse(raw || "{}");',
  "const write = (rel, text) => {",
  "  fs.mkdirSync(path.dirname(path.resolve(rel)), { recursive: true });",
  "  fs.writeFileSync(rel, text);",
  "};",
  'fs.writeFileSync("probe.json", JSON.stringify({ checksVisible: fs.existsSync("checks") }));',
  'if (step === "s1") {',
  '  write("lib/shared.mjs", "export const base = 10;\\n");',
  '  write("app.mjs", \'import { base } from "./lib/shared.mjs";\\nexport const total = base + 5;\\n\');',
  '} else if (step === "s2") {',
  '  write("lib/shared.mjs", "export const seed = 10;\\n");',
  '  write("app.mjs", \'import { seed } from "./lib/shared.mjs";\\nexport const total = seed + 5;\\n\');',
  "}",
  'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
].join("\n");

const AGENT_PRESERVING = AGENT_LOSSY.replace(
  '  write("lib/shared.mjs", "export const seed = 10;\\n");',
  '  write("lib/shared.mjs", "export const base = 10;\\nexport const seed = base;\\n");',
);

const S1_CHECK = [
  'import assert from "node:assert/strict";',
  'import { readFileSync } from "node:fs";',
  'import { base } from "../lib/shared.mjs";',
  'import { total } from "../app.mjs";',
  'const probe = JSON.parse(readFileSync(new URL("../probe.json", import.meta.url), "utf8"));',
  'assert.equal(probe.checksVisible, false, "the evaluator must be hidden from the agent");',
  'assert.equal(base, 10, "shared base");',
  'assert.equal(total, 15, "total");',
].join("\n");

const S2_CHECK = [
  'import assert from "node:assert/strict";',
  'import { seed } from "../lib/shared.mjs";',
  'import { total } from "../app.mjs";',
  'assert.equal(seed, 10, "shared seed");',
  'assert.equal(total, 15, "total");',
].join("\n");

const TRAJECTORY = {
  id: "shared-dependency",
  workspace: "workspace",
  hidden: ["checks"],
  steps: [
    { id: "s1", prompt: "Set the shared base to 10 and total to base + 5.", check: "node checks/s1.mjs" },
    { id: "s2", prompt: "Rename the shared export to seed and keep total = seed + 5.", check: "node checks/s2.mjs" },
  ],
};

function buildFixture(dir, agentSource) {
  const workspace = path.join(dir, "workspace");
  mkdirSync(path.join(workspace, "lib"), { recursive: true });
  mkdirSync(path.join(workspace, "checks"), { recursive: true });
  writeFileSync(path.join(workspace, "lib", "shared.mjs"), "export const base = 0;\n");
  writeFileSync(path.join(workspace, "app.mjs"), 'import { base } from "./lib/shared.mjs";\nexport const total = base + 0;\n');
  writeFileSync(path.join(workspace, "checks", "s1.mjs"), `${S1_CHECK}\n`);
  writeFileSync(path.join(workspace, "checks", "s2.mjs"), `${S2_CHECK}\n`);
  const agentFile = path.join(dir, "agent.mjs");
  writeFileSync(agentFile, `${agentSource}\n`);
  return agentFile;
}

function evaluate(dir, agentFile) {
  assert.ok(existsSync(RUNNER), "scripts/harness/trajectory-runner.mjs must exist");
  const result = spawnSync(process.execPath, [RUNNER], {
    input: JSON.stringify({ task: TRAJECTORY, root: dir, lane: "vanilla", enabled: {} }),
    encoding: "utf8",
    env: { ...process.env, KRN_HARNESS_AGENT: `node ${agentFile}` },
    cwd: dir,
  });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.trim().split("\n").filter(Boolean).at(-1);
  return JSON.parse(line);
}

async function withFixture(agentSource, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-trajectory-"));
  try {
    const agentFile = buildFixture(dir, agentSource);
    return await run(dir, agentFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the trajectory observer is wired into the library gate", () => {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:lib"] ?? "", /test\/harness\/trajectory-contract\.test\.mjs/, "the trajectory observer must run in test:lib");
});

test("a preserving trajectory is accepted", async () => {
  await withFixture(AGENT_PRESERVING, (dir, agentFile) => {
    const report = evaluate(dir, agentFile);
    assert.equal(report.complete, true, JSON.stringify(report));
    assert.deepEqual(report.lost, [], JSON.stringify(report));
    assert.deepEqual(report.steps.map((entry) => entry.pass), [true, true], JSON.stringify(report));
    assert.deepEqual(report.steps.map((entry) => entry.invalid), [null, null], JSON.stringify(report));
  });
});

test("a trajectory whose latest step passes but broke an earlier obligation is rejected", async () => {
  await withFixture(AGENT_LOSSY, (dir, agentFile) => {
    const report = evaluate(dir, agentFile);
    assert.equal(report.steps[1].pass, true, JSON.stringify(report));
    assert.equal(report.complete, false, JSON.stringify(report));
    assert.ok(report.lost.includes("s1"), JSON.stringify(report));
  });
});
