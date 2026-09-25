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

// The probe pairs one focused baseline with one mutated run for the same
// selection, so the scripted runner answers by call index for each selection
// key. The fake TAP names carry the requested focus, so the oracle can bind a
// failure to the observer instead of trusting a counter.
const patternOf = (args) =>
  (args.find((arg) => arg.startsWith("--test-name-pattern=")) ?? "--test-name-pattern=.*").slice("--test-name-pattern=".length);

const green = (focus) => ({ ok: true, out: `ok 1 - ${focus}\n# tests 1\n# pass 1\n# fail 0\n`, err: "" });
const failing = (focus) => ({ ok: false, out: `not ok 1 - ${focus}\n# tests 1\n# pass 0\n# fail 1\n`, err: "" });
const infra = () => ({ ok: false, out: "# tests 1\n# pass 0\n# fail 1\nnot ok 1 - test/audit/quality-audit.test.mjs\n", err: "" });

function selectionKey(args) {
  return args.filter((arg) => arg.startsWith("--test-name-pattern=") || arg.endsWith(".test.mjs")).join("|");
}

function scriptedRun(outcomes) {
  const calls = new Map();
  return (_bin, args) => {
    const focus = patternOf(args);
    const key = selectionKey(args);
    const index = calls.get(key) ?? 0;
    calls.set(key, index + 1);
    const outcome = outcomes[Math.min(index, outcomes.length - 1)];
    return typeof outcome === "function" ? outcome(focus) : outcome;
  };
}

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

test("the probe reports a mutant as surviving when its suite stays green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([green]) });
  assert.equal(results.length, probe.MUTATIONS.length);
  assert.ok(results.every((result) => result.killed === false), JSON.stringify(results));
});

test("the probe counts a failing focused suite as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, failing]) });
  assert.ok(results.every((result) => result.killed === true), JSON.stringify(results));
});

test("the probe refuses to read an infrastructure failure as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, infra]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("the probe refuses to score a mutant when its focused baseline is not green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const results = probe.runMutationProbe({ root, run: scriptedRun([failing]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
  assert.ok(results.every((result) => /baseline/.test(result.detail)), JSON.stringify(results));
});

test("every baseline runs the same focused selection as its mutant", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const calls = [];
  const run = (_bin, args) => {
    calls.push(args);
    return green(patternOf(args));
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

test("a failure outside the focused observer is not a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const outside = (focus) => ({
    ok: false,
    out: `ok 1 - ${focus}\nnot ok 2 - an unrelated setup case\n# tests 2\n# pass 1\n# fail 1\n`,
    err: "",
  });
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, outside]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("a file-level failure with other passing tests is not a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const fileLevel = (focus) => ({
    ok: false,
    out: `ok 1 - ${focus}\nnot ok 2 - test/audit/quality-audit.test.mjs\n# tests 2\n# pass 1\n# fail 1\n`,
    err: "",
  });
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, fileLevel]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("an observer failure is a kill even when its diagnostics quote a load error", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const quoted = (focus) => ({
    ok: false,
    out: `not ok 1 - ${focus}\n  ---\n  error: "Cannot find module 'missing-dep'"\n  ...\n# tests 1\n# pass 0\n# fail 1\n`,
    err: "",
  });
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, quoted]) });
  assert.ok(results.every((result) => result.killed === true), JSON.stringify(results));
});

test("an observer that did not run is invalid even on a zero exit", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const skipped = () => ({ ok: true, out: "# tests 0\n# pass 0\n# fail 0\n", err: "" });
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, skipped]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("an interrupted run is invalid", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const interrupted = () => ({ ok: false, out: "", err: "" });
  const results = probe.runMutationProbe({ root, run: scriptedRun([green, interrupted]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

// A kill is only attributable when the focus names exactly one observer; an
// ambiguous focus could score an unrelated failing test as the kill.
test("the probe refuses a mutation whose focus matches more than one test", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const ambiguous = (focus) => ({ ok: true, out: `ok 1 - ${focus}: one\nok 2 - ${focus}: two\n# tests 2\n# pass 2\n# fail 0\n`, err: "" });
  const results = probe.runMutationProbe({ root, run: scriptedRun([ambiguous]) });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
  assert.ok(results.every((result) => /ambiguous/.test(result.detail)), JSON.stringify(results));
});
