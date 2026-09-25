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
  const survivors = results
    .filter((result) => !result.killed || result.invalid)
    .map((result) => `${result.id}: ${result.detail}${result.invalid ? " (invalid)" : ""}`);
  assert.deepEqual(survivors, [], `surviving or unclassified mutants:\n${survivors.join("\n")}`);
});

const GREEN = { ok: true, out: "# tests 1\n# pass 1\n# fail 0\n", err: "" };
const FAILING = { ok: false, out: "# tests 1\n# pass 0\n# fail 1\n", err: "" };
const INFRA = { ok: false, out: "# tests 0\n# pass 0\n# fail 0\n", err: "cannot find module" };

// The probe pairs one focused baseline with one mutated run for the same
// selection, so the scripted runner answers by call index for each selection
// key: an identical key is what proves the baseline and the mutant agree.
function selectionKey(args) {
  return args.filter((arg) => arg.startsWith("--test-name-pattern=") || arg.endsWith(".test.mjs")).join("|");
}

function scriptedRun(outcomes) {
  const calls = new Map();
  return (_bin, args) => {
    const key = selectionKey(args);
    const index = calls.get(key) ?? 0;
    calls.set(key, index + 1);
    return outcomes[Math.min(index, outcomes.length - 1)];
  };
}

test("the probe reports a mutant as surviving when its suite stays green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([GREEN]) });
  assert.equal(results.length, probe.MUTATIONS.length);
  assert.ok(results.every((result) => result.killed === false), JSON.stringify(results));
});

test("the probe counts a failing focused suite as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([GREEN, FAILING]) });
  assert.ok(results.every((result) => result.killed === true), JSON.stringify(results));
});

test("the probe refuses to read an infrastructure failure as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([GREEN, INFRA]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("the probe refuses to score a mutant when its focused baseline is not green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  // The full suite would be green, but the selection that will judge the mutant
  // is already red before any mutation; that red belongs to the baseline.
  const run = (_bin, args) =>
    args.some((arg) => arg.startsWith("--test-name-pattern=")) ? FAILING : GREEN;
  const results = probe.runMutationProbe({ root, run });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
  assert.ok(results.every((result) => /baseline/.test(result.detail)), JSON.stringify(results));
});

test("every baseline runs the same focused selection as its mutant", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const calls = [];
  const run = (_bin, args) => {
    calls.push(args);
    return GREEN;
  };
  const results = probe.runMutationProbe({ root, run });
  assert.equal(results.length, probe.MUTATIONS.length);
  assert.equal(calls.length, probe.MUTATIONS.length * 2, "one focused baseline plus one mutant run per mutation");
  for (const args of calls) {
    assert.ok(args.some((arg) => arg.startsWith("--test-name-pattern=")), `the baseline must use the mutant's focused selection: ${args.join(" ")}`);
  }
  const pairs = new Map();
  for (const args of calls) {
    const key = selectionKey(args);
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  assert.ok([...pairs.values()].every((count) => count === 2), `every selection must be measured twice: ${[...pairs.entries()].map(([key, count]) => `${key}=${count}`).join(", ")}`);
});
