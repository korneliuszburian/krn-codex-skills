import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), "krn-evaluator-base-"));
  cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(join(dir, "config", "conformance.json"), `${JSON.stringify({
    version: 1,
    program: "scripts/krn.mjs",
    cases: [
      {
        id: "required-probe",
        required: true,
        steps: [{ message: "chore: baseline", files: { "README.md": "one\n" } }],
        run: ["state", "check"],
        expect: { exit: 0 },
      },
    ],
  }, null, 2)}\n`);
  return dir;
}

function makeCandidate(base, { declareCase }) {
  const dir = mkdtempSync(join(tmpdir(), "krn-evaluator-candidate-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "krn.mjs"), "process.exit(0);\n");
  mkdirSync(join(dir, "config"), { recursive: true });
  const cases = declareCase
    ? JSON.parse(readFileSync(join(base, "config", "conformance.json"), "utf8")).cases
    : [];
  writeFileSync(join(dir, "config", "conformance.json"), `${JSON.stringify({ version: 1, program: "scripts/krn.mjs", cases }, null, 2)}\n`);
  return dir;
}

function evaluate(evaluatorDir, base, candidate) {
  return spawnSync(
    process.execPath,
    [join(evaluatorDir, "scripts", "krn.mjs"), "conformance", "check", "--root", base, "--candidate", candidate, "--frozen"],
    { encoding: "utf8" },
  );
}

test("the approved base evaluator rejects a candidate that drops a required case", () => {
  const base = makeBase();
  const candidate = makeCandidate(base, { declareCase: false });
  try {
    const result = evaluate(base, base, candidate);
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /required case missing/);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(candidate, { recursive: true, force: true });
  }
});

test("the approved base evaluator accepts a candidate that keeps the required case", () => {
  const base = makeBase();
  const candidate = makeCandidate(base, { declareCase: true });
  try {
    const result = evaluate(base, base, candidate);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /ok required-probe/);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(candidate, { recursive: true, force: true });
  }
});

test("a candidate that weakens its own evaluator cannot discharge the required case", () => {
  const base = makeBase();
  const candidate = makeCandidate(base, { declareCase: false });
  try {
    const asCandidateEvaluator = evaluate(candidate, base, candidate);
    assert.equal(asCandidateEvaluator.status, 0, "the weakened candidate evaluator would accept the regression");
    const asApprovedEvaluator = evaluate(base, base, candidate);
    assert.equal(asApprovedEvaluator.status, 1, "the approved evaluator must reject the same candidate");
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(candidate, { recursive: true, force: true });
  }
});

test("the frozen recipe runs the approved evaluator, not the candidate copy", () => {
  const packageJson = readFileSync(join(root, "package.json"), "utf8");
  assert.ok(/node \\"\$dir\/scripts\/krn\.mjs\\" conformance check/.test(packageJson), "conformance:check must run the base worktree evaluator");
  const workflow = readFileSync(join(root, ".github", "workflows", "validate.yml"), "utf8");
  assert.ok(/node \/tmp\/krn-conformance\/scripts\/krn\.mjs conformance check/.test(workflow), "CI must run the base worktree evaluator");
});
