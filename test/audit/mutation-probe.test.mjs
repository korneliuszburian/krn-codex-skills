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

test("the probe reports a mutant as surviving when its suite stays green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const run = () => ({ ok: true, out: "# tests 1\n# fail 0\n", err: "" });
  const results = probe.runMutationProbe({ root, run });
  assert.equal(results.length, probe.MUTATIONS.length);
  assert.ok(results.every((result) => result.killed === false), JSON.stringify(results));
});

test("the probe counts a failing focused suite as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const run = (_bin, args) =>
    args.some((arg) => arg.startsWith("--test-name-pattern"))
      ? { ok: false, out: "# tests 1\n# pass 0\n# fail 1\n", err: "" }
      : { ok: true, out: "# tests 1\n# pass 1\n# fail 0\n", err: "" };
  const results = probe.runMutationProbe({ root, run });
  assert.ok(results.every((result) => result.killed === true), JSON.stringify(results));
});

test("the probe refuses to read an infrastructure failure as a kill", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const run = (_bin, args) =>
    args.some((arg) => arg.startsWith("--test-name-pattern"))
      ? { ok: false, out: "# tests 0\n# pass 0\n# fail 0\n", err: "cannot find module" }
      : { ok: true, out: "# tests 1\n# pass 1\n# fail 0\n", err: "" };
  const results = probe.runMutationProbe({ root, run });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});

test("the probe refuses to score a mutant when its focused baseline is not green", async () => {
  const probe = await loadProbe();
  assert.ok(probe, "scripts/lib/audit/mutation-probe.mjs must exist");
  const run = (_bin, args) =>
    args.some((arg) => arg.startsWith("--test-name-pattern"))
      ? { ok: false, out: "# tests 1\n# pass 0\n# fail 1\n", err: "" }
      : { ok: false, out: "# tests 0\n# pass 0\n# fail 0\n", err: "boom" };
  const results = probe.runMutationProbe({ root, run });
  assert.ok(results.every((result) => result.killed === false && result.invalid === true), JSON.stringify(results));
});
