import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const compilePath = join(repoRoot, "scripts", "lib", "brief", "compile.mjs");

async function loadCompile() {
  assert.ok(existsSync(compilePath), "scripts/lib/brief/compile.mjs must exist");
  return import("../../scripts/lib/brief/compile.mjs");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-brief-"));
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "outcome"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(
    join(root, ".krn", "runs", "delivery-loop", "outcome", "state.md"),
    "<outcome-capsule>\nOutcome and observable acceptance: [do the thing; todo]\nOutcome state: ACTIVE\n</outcome-capsule>\n",
  );
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n| Keep it small | x | `test:state` | | `test/proof.test.mjs::probe@0000000` | path:scripts/** | |\n| Old rule | y | `test:state` | | `test/proof.test.mjs::probe@0000000` | | retired@0000000 |\n",
  );
  writeFileSync(
    join(root, "docs", "research", "lab-tests.md"),
    "| Id | Result |\n|---|---|\n| LT-1 | pass |\n| LT-2 | pass |\n",
  );
  return root;
}

test("the brief compiles the capsule, lessons, measurements, and frontier", async () => {
  const { compileBrief } = await loadCompile();
  const root = fixture();
  const brief = compileBrief({ root });
  assert.match(brief, /^# Brief\n/);
  assert.match(brief, /## Objective[\s\S]*do the thing/);
  assert.match(brief, /Outcome state: ACTIVE/);
  assert.match(brief, /## Invariants[\s\S]*One owner per primitive/);
  assert.match(brief, /1 active lessons/);
  assert.match(brief, /2 lab-test rows; latest: LT-1, LT-2/);
  assert.match(brief, /## Retired[\s\S]*Old rule/);
  rmSync(root, { recursive: true, force: true });
});

test("the brief is deterministic", async () => {
  const { compileBrief } = await loadCompile();
  const root = fixture();
  assert.equal(compileBrief({ root }), compileBrief({ root }));
  rmSync(root, { recursive: true, force: true });
});

test("the committed docs/BRIEF.md is current", async () => {
  const { compileBrief } = await loadCompile();
  const committed = readFileSync(join(repoRoot, "docs", "BRIEF.md"), "utf8");
  assert.equal(committed, compileBrief({ root: repoRoot }), "run krn brief --root . --write");
});
