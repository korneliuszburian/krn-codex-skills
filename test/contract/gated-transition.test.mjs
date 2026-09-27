import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Imported lazily so the base overlay reports a real assertion failure, not a
// module-load setup error, when the owner does not exist yet.
const loadGate = async () => {
  try {
    return await import("../../scripts/lib/contract/gated-transition.mjs");
  } catch {
    return null;
  }
};

// The preregistered falsifier for the gated-transition primitive: it is a proof
// theater if it admits a transition whose base state was not observed red, or
// that no independent verifier checked, or whose waiver resolves to nothing.
const transition = (kind = "task-close") => ({ kind, fixedPoint: "abc1234", subject: "sh-1" });
const red = () => ({ red: true, evidence: "exit 1 at base" });
const green = () => ({ red: false, evidence: "exit 0 at base" });
const passing = { name: "test", verify: () => ({ ok: true, evidence: "executed" }) };

test("the primitive spans exactly the four decision surfaces", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  assert.deepEqual(gate.TRANSITION_KINDS, ["commit", "task-close", "review", "handoff"]);
});

test("an admitted transition carries an executed red-based claim and a verifier", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const verdict = gate.gateTransition({ transition: transition(), claim: { falsifier: "node --test t.mjs", before: red() }, verifier: passing });
  assert.equal(verdict.admitted, true, JSON.stringify(verdict));
  assert.equal(verdict.verifier, "test");
});

test("a green base state is refused: a check that already passed is not a flip", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const verdict = gate.gateTransition({ transition: transition(), claim: { falsifier: "node --test t.mjs", before: green() }, verifier: passing });
  assert.equal(verdict.admitted, false, JSON.stringify(verdict));
  assert.match(verdict.reason, /observed red base state/);
});

test("a transition no independent verifier checked is refused", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const missing = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red() } });
  assert.equal(missing.admitted, false);
  assert.match(missing.reason, /verifier is required/);
  const failing = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red() }, verifier: { name: "v", verify: () => ({ ok: false, reason: "the observer did not fail" }) } });
  assert.equal(failing.admitted, false);
  assert.match(failing.reason, /observer did not fail/);
});

test("a verifier that throws is refused, not allowed", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const verdict = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red() }, verifier: { name: "v", verify: () => { throw new Error("boom"); } } });
  assert.equal(verdict.admitted, false);
  assert.match(verdict.reason, /verifier failed/);
});

test("a waiver is admissible only when reasoned and resolvable", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const bare = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red(), waiver: {} } });
  assert.equal(bare.admitted, false, "an empty waiver never discharges an obligation");
  const unresolved = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red(), waiver: { reason: "not applicable" } } });
  assert.equal(unresolved.admitted, false, "a reason with no anchor is not a discharge");
});

test("a waiver cannot admit without a named obligation and independent resolution", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  // A plausible-looking path and reason are not evidence that the path exists,
  // nor do they identify which obligation is being waived.
  const verdict = gate.gateTransition({
    transition: transition(),
    claim: { falsifier: "x", before: red(), waiver: { reason: "generated fixture", resolves: ["scripts/x.mjs"] } },
    verifier: passing,
  });
  assert.equal(verdict.admitted, false, JSON.stringify(verdict));
  assert.match(verdict.reason, /waiver.*unsupported/i);
});

test("the brief is the subagent's contract, not the claim", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const brief = gate.briefFor({ claim: { falsifier: "node --test t.mjs" }, fixedPoint: "abc1234", scope: "scripts/x.mjs", output: "findings only, no patch" });
  assert.match(brief, /Fixed point: abc1234/);
  assert.match(brief, /Falsifier: node --test t\.mjs/);
  assert.match(brief, /Output: findings only/);
  assert.doesNotMatch(brief, /before|waiver|verifier/, "the brief must not leak the integrator's facets");
  assert.throws(() => gate.briefFor({ claim: { falsifier: "" }, fixedPoint: "a", scope: "b", output: "c" }), /concrete falsifier/);
});

test("the command adapter runs the falsifier and reports the head outcome", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const verifier = gate.commandVerifier({ run: () => ({ ok: true, status: 0 }), cwd: "/tmp" });
  assert.equal(gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red() }, verifier }).admitted, true);
  const failing = gate.commandVerifier({ run: () => ({ ok: false, status: 1 }), cwd: "/tmp" });
  const verdict = gate.gateTransition({ transition: transition(), claim: { falsifier: "x", before: red() }, verifier: failing });
  assert.equal(verdict.admitted, false);
  assert.match(verdict.reason, /did not pass at the head/);
});

test("the family adapter is the second real seam", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  const verifier = gate.familyVerifier({ review: () => ({ ok: true }), family: "codex" });
  const verdict = gate.gateTransition({ transition: transition("review"), claim: { falsifier: "x", before: red() }, verifier });
  assert.equal(verdict.admitted, true);
  assert.equal(verdict.verifier, "family:codex");
});

test("escalation is admitted only against a recorded failure", async () => {
  const gate = await loadGate();
  assert.ok(gate, "scripts/lib/contract/gated-transition.mjs must exist");
  assert.equal(gate.escalationGate({ current: "brief", proposed: "graph store" }).admitted, false);
  assert.equal(gate.escalationGate({ current: "brief", proposed: "graph store", failure: { recorded: false, evidence: "none" } }).admitted, false);
  const admitted = gate.escalationGate({ current: "brief", proposed: "graph store", failure: { recorded: true, evidence: "LT-6 stage loss" } });
  assert.equal(admitted.admitted, true);
  assert.match(admitted.evidence, /brief -> graph store/);
});

// The end-to-end slice: the CLI observes the red base state by running the
// falsifier in a detached base worktree, then admits the head transition.
test("the CLI gate observes the red base and admits a real flip", () => {
  const cli = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "krn-gate-cli-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    writeFileSync(join(root, "package.json"), '{"type":"module","scripts":{"test":"node --test setup.test.mjs"}}\n');
    // A test NAME that resembles a setup error or filename stays assertion RED.
    writeFileSync(join(root, "t.mjs"), 'import test from "node:test";\ntest("stable", () => {});\ntest("SyntaxError", () => { throw new Error("red"); });\ntest("config.js", () => { throw new Error("red"); });\n');
    writeFileSync(join(root, "setup.test.mjs"), 'import "./dependency.mjs"; import test from "node:test"; test("ready", () => {});\n');
    writeFileSync(join(root, "fixture"), 'import test from "node:test"; const x = undefined.value; test("ready", () => {});\n');
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(join(root, "t.mjs"), 'import test from "node:test";\ntest("stable", () => {});\ntest("SyntaxError", () => {});\ntest("config.js", () => {});\n');
    writeFileSync(join(root, "dependency.mjs"), "export const ready = true;\n");
    writeFileSync(join(root, "fixture"), 'import test from "node:test"; const x = 1; test("ready", () => {});\n');
    git("add", "-A");
    git("commit", "-qm", "head");

    const runGate = (base, { kind = "commit", fixedPoint = "HEAD", falsifier = "node --test t.mjs", waiver = [] } = {}) => {
      const args = [cli, "gate", "check", "--root", root, "--kind", kind, "--fixed-point", fixedPoint, "--falsifier", falsifier, "--base", base, ...waiver, "--json"];
      const result = spawnSync(process.execPath, args, { encoding: "utf8" });
      let parsed = null;
      try { parsed = JSON.parse(result.stdout); } catch { parsed = null; }
      assert.ok(parsed, `the gate must print a JSON verdict: ${result.stdout}${result.stderr}`);
      return { ...parsed, exitCode: result.status };
    };
    const admitted = runGate("HEAD~1");
    assert.equal(admitted.admitted, true, JSON.stringify(admitted));
    assert.equal(admitted.exitCode, 0);

    for (const kind of ["task-close", "review", "handoff"]) {
      const unsupported = runGate("HEAD~1", { kind });
      assert.equal(unsupported.admitted, false, `${kind}: ${JSON.stringify(unsupported)}`);
      assert.equal(unsupported.exitCode, 1);
      assert.match(unsupported.reason, /only commit transitions/i);
    }

    const namedFileLike = runGate("HEAD~1", { falsifier: "node --test --test-name-pattern=config.js t.mjs" });
    assert.equal(namedFileLike.admitted, true, JSON.stringify(namedFileLike));

    const specReporter = runGate("HEAD~1", { falsifier: "node --test --test-reporter=spec t.mjs" });
    assert.equal(specReporter.admitted, true, JSON.stringify(specReporter));
    const specFileLike = runGate("HEAD~1", { falsifier: "node --test --test-reporter=spec --test-name-pattern=config.js t.mjs" });
    assert.equal(specFileLike.admitted, true, JSON.stringify(specFileLike));

    const wrappedSetup = runGate("HEAD~1", { falsifier: "npm test --silent" });
    assert.equal(wrappedSetup.admitted, false, JSON.stringify(wrappedSetup));
    assert.match(wrappedSetup.reason, /base.*setup error/i);

    const extensionlessSetup = runGate("HEAD~1", { falsifier: "node --test ./fixture" });
    assert.equal(extensionlessSetup.admitted, false, JSON.stringify(extensionlessSetup));
    assert.match(extensionlessSetup.reason, /base.*setup error/i);
    const specSetup = runGate("HEAD~1", { falsifier: "node --test --test-reporter=spec ./fixture" });
    assert.equal(specSetup.admitted, false, JSON.stringify(specSetup));
    assert.match(specSetup.reason, /base.*setup error/i);

    const optionSetup = runGate("HEAD~1", { falsifier: "node --no-warnings --test setup.test.mjs" });
    assert.equal(optionSetup.admitted, false, JSON.stringify(optionSetup));
    assert.match(optionSetup.reason, /base.*setup error/i);

    const invalid = runGate("HEAD~1", { fixedPoint: "not-a-revision" });
    assert.equal(invalid.admitted, false, JSON.stringify(invalid));
    assert.equal(invalid.exitCode, 1);
    assert.match(invalid.reason, /fixed point/i);

    const stale = runGate("HEAD~1", { fixedPoint: git("rev-parse", "HEAD~1").trim() });
    assert.equal(stale.admitted, false, JSON.stringify(stale));
    assert.match(stale.reason, /fixed point/i);

    const waiver = ["--waiver-reason", "diagnostic-only", "--waiver-resolves", "t.mjs"];
    const waivedFailure = runGate("HEAD~1", { falsifier: "false", waiver });
    assert.equal(waivedFailure.admitted, false, JSON.stringify(waivedFailure));
    assert.equal(waivedFailure.exitCode, 1);
    assert.match(waivedFailure.reason, /waiver.*unsupported/i);

    const unresolved = runGate("HEAD~1", { waiver: ["--waiver-reason", "diagnostic-only", "--waiver-resolves", "not-in-repo.md"] });
    assert.equal(unresolved.admitted, false, JSON.stringify(unresolved));
    assert.match(unresolved.reason, /waiver.*unsupported/i);

    const setup = runGate("HEAD~1", { falsifier: "node --no-warnings --test missing.test.mjs" });
    assert.equal(setup.admitted, false, JSON.stringify(setup));
    assert.match(setup.reason, /base.*setup error/i);

    const headSetup = runGate("HEAD~1", { falsifier: "node --test t.mjs && krn-missing-command" });
    assert.equal(headSetup.admitted, false, JSON.stringify(headSetup));
    assert.match(headSetup.reason, /setup error at the head/i);

    assert.equal(admitted.fixedPoint, git("rev-parse", "HEAD").trim(), "the fixed point must be a resolved commit ID");
    assert.equal(admitted.base, git("rev-parse", "HEAD~1").trim(), "the base must be a resolved commit ID");

    const refused = runGate("HEAD");
    assert.equal(refused.admitted, false, JSON.stringify(refused));
    assert.match(refused.reason, /observed red base state/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
