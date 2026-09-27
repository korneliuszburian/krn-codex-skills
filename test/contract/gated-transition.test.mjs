import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The only consumer seam: run a real falsifier in a detached base worktree and
// in the current head. The module's internal policy is not a second product.
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
    assert.equal(admitted.verifier, "command", "the admitted head must name its executing verifier");

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

    const failedHead = runGate("HEAD~1", { falsifier: "false" });
    assert.equal(failedHead.admitted, false, JSON.stringify(failedHead));
    assert.equal(failedHead.exitCode, 1);
    assert.match(failedHead.reason, /did not pass at the head/i);

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
