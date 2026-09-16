import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));

const loadProbe = async () => {
  try {
    return await import("../../scripts/lib/audit/mutation-probe.mjs");
  } catch {
    return null;
  }
};

test("the mutation set is bounded and spans both target modules", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  assert.ok(probe.MUTATIONS.length >= 8 && probe.MUTATIONS.length <= 12, `expected 8-12 mutations, got ${probe.MUTATIONS.length}`);
  assert.ok(probe.MUTATIONS.some((mutation) => mutation.file === "scripts/lib/contract/change-contract-runs.mjs"), "the contract spine must be covered");
  assert.ok(probe.MUTATIONS.some((mutation) => mutation.file === "scripts/lib/audit/quality-audit.mjs"), "the audit spine must be covered");
});

test("every hand-listed mutation is killed by its focused suite", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root });
  const survivors = results.filter((result) => !result.killed).map((result) => `${result.id}: ${result.detail}`);
  assert.deepEqual(survivors, [], `surviving mutants:\n${survivors.join("\n")}`);
});

test("the probe reports a mutant as surviving when its suite stays green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const spawn = () => ({ status: 0, stdout: "# tests 1\n# fail 0\n", stderr: "" });
  const results = probe.runMutationProbe({ root, spawn });
  assert.equal(results.length, probe.MUTATIONS.length);
  assert.ok(results.every((result) => result.killed === false), JSON.stringify(results));
});
