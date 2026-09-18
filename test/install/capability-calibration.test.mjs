import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(new URL("../../scripts/lib/install/host-capabilities.mjs", import.meta.url));
const sealFlowPath = fileURLToPath(new URL("./seal-flow.test.mjs", import.meta.url));
const present = existsSync(modulePath);
const guard = present ? false : "not-applicable: host-capabilities";
const load = () => import(pathToFileURL(modulePath).href);

test("the host capability probe module is present", () => {
  assert.ok(present, `expected a host capability probe at ${modulePath}`);
});

test("the git probe is positively calibrated where git is a hard prerequisite", { skip: guard }, async () => {
  const { hostCapabilities } = await load();
  const capabilities = hostCapabilities();
  assert.equal(capabilities.gitChild, true, "git is a hard prerequisite here, so a stubbed-false probe must not pass");
  assert.equal(typeof capabilities.bwrap, "boolean");
});

test("calibration evaluates the probe instead of asserting its shape", { skip: guard }, async () => {
  const { hostCapabilities } = await load();
  const ran = [];
  const capabilities = hostCapabilities({
    gitChild: () => {
      ran.push("gitChild");
      return false;
    },
    bwrap: () => {
      ran.push("bwrap");
      return true;
    },
  });
  assert.deepEqual(capabilities, { gitChild: false, bwrap: true });
  assert.deepEqual(ran, ["gitChild", "bwrap"]);
});

test("a flow skips only on the capabilities it actually spawns", { skip: guard }, async () => {
  const { capabilitySkip } = await load();
  assert.equal(capabilitySkip({ bwrap: false, gitChild: true }, ["gitChild"]), false);
  assert.equal(capabilitySkip({ bwrap: true, gitChild: false }, ["gitChild"]), "not-applicable: gitChild");
});

test("the seal suite names git, not the unused bwrap binary", { skip: guard }, async () => {
  const { FLOW_CAPABILITIES } = await load();
  assert.deepEqual(FLOW_CAPABILITIES.seal, ["gitChild"]);
  const sealFlow = readFileSync(sealFlowPath, "utf8");
  assert.match(sealFlow, /FLOW_CAPABILITIES\.seal/);
  assert.doesNotMatch(sealFlow, /capabilitySkip\(\)/);
});

test("a missing capability is recorded in the test output", { skip: guard }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "krn-capability-calibration-"));
  const fixture = path.join(dir, "skip.test.mjs");
  writeFileSync(fixture, [
    'import test from "node:test";',
    `const { capabilitySkip } = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
    'test("gated suite", { skip: capabilitySkip({ bwrap: false, gitChild: false }, ["gitChild"]) }, () => {});',
    "",
  ].join("\n"));
  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /# SKIP not-applicable: gitChild$/m);
    assert.doesNotMatch(run.stdout, /bwrap/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
