import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(new URL("../../scripts/lib/install/host-capabilities.mjs", import.meta.url));
const present = existsSync(modulePath);
const guard = present ? false : "not-applicable: host-capabilities";
const load = () => import(pathToFileURL(modulePath).href);

test("the host capability probe module is present", () => {
  assert.ok(present, `expected a host capability probe at ${modulePath}`);
});

test("hostCapabilities probes bwrap and gitChild as booleans", { skip: guard }, async () => {
  const { hostCapabilities } = await load();
  const capabilities = hostCapabilities();
  assert.deepEqual(Object.keys(capabilities).sort(), ["bwrap", "gitChild"]);
  assert.equal(typeof capabilities.bwrap, "boolean");
  assert.equal(typeof capabilities.gitChild, "boolean");
});

test("a missing capability records the not-applicable skip", { skip: guard }, async () => {
  const { capabilitySkip } = await load();
  assert.equal(capabilitySkip({ bwrap: true, gitChild: false }), "not-applicable: gitChild");
  assert.equal(capabilitySkip({ bwrap: false, gitChild: true }), "not-applicable: bwrap");
  assert.equal(capabilitySkip({ bwrap: false, gitChild: false }), "not-applicable: bwrap, gitChild");
});

test("a capable host still runs the suite", { skip: guard }, async () => {
  const { capabilitySkip } = await load();
  assert.equal(capabilitySkip({ bwrap: true, gitChild: true }), false);
});

test("the seal-flow suite gates on the capability skip", { skip: guard }, () => {
  const sealFlow = readFileSync(fileURLToPath(new URL("./seal-flow.test.mjs", import.meta.url)), "utf8");
  assert.match(sealFlow, /capabilitySkip\(/);
});
