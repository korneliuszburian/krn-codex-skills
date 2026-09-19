import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import { runGit } from "../../scripts/lib/support/git-cli.mjs";
import { inspectSpineState } from "../../scripts/lib/state/state-check.mjs";
import { writeCapsule } from "../support/state-fixtures.mjs";

const RULE = "capsule-narrative-over-budget";
const REGISTRY = fileURLToPath(new URL("../../docs/research/lab-tests.md", import.meta.url));

const registryPage = (() => {
  try {
    return readFileSync(REGISTRY, "utf8");
  } catch {
    return "";
  }
})();

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-capsule-budget-"));
  const git = (args) => runGit(root, args).out;
  git(["init", "-q"]);
  git(["config", "user.email", "lab@krn.local"]);
  git(["config", "user.name", "lab"]);
  git(["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: git(["rev-parse", "HEAD"]) };
}

function capsuleText({ head, evidence = "none", next = "continue the bounded slice", unknowns = "none", review = "none" }) {
  return [
    "Outcome and observable acceptance: test",
    "Current workflow owner and sole writer: $delivery-loop",
    "Outcome state: ACTIVE",
    "Publication state: LOCAL_ONLY",
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: HEAD=${head}`,
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    "Outstanding workflow-run cleanup: none",
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    `Evidence observed: ${evidence}`,
    "Explicit non-proofs: none",
    `Review fixed point and Standards / Spec disposition: ${review}`,
    `Open unknowns and blockers with owners: ${unknowns}`,
    "Workflow friction and lesson candidates: none",
    "Durable CONTEXT / ADR / research references: none",
    `Next bounded owner and action: ${next}`,
    "",
  ].join("\n");
}

async function withRepo(body) {
  const { root, head } = makeRepo();
  try {
    await body({ root, head });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function budgetFinding(root, text) {
  writeCapsule(root, text);
  return inspectSpineState({ repo: root }).errors.find((error) => error.rule === RULE);
}

test("an over-long Evidence observed fails with the named rule and the LT pointer", async () => {
  await withRepo(({ root, head }) => {
    const finding = budgetFinding(root, capsuleText({ head, evidence: "x".repeat(4097) }));
    assert.ok(finding, "an over-long Evidence observed must trip the budget rule");
    assert.match(finding.detail, /Evidence observed 4097\/4096/);
    assert.match(finding.detail, /docs\/research\/lab-tests\.md/);
  });
});

test("each other narrative field over its cap fails with the named rule", async () => {
  const fields = [
    ["Next bounded owner and action", "next"],
    ["Open unknowns and blockers with owners", "unknowns"],
    ["Review fixed point and Standards / Spec disposition", "review"],
  ];
  for (const [label, key] of fields) {
    await withRepo(({ root, head }) => {
      const finding = budgetFinding(root, capsuleText({ head, [key]: "x".repeat(2049) }));
      assert.ok(finding, `${label} over its cap must trip the budget rule`);
      assert.match(finding.detail, new RegExp(`${label} 2049/2048`));
    });
  }
});

test("a capsule over the combined narrative cap fails with the named rule", async () => {
  await withRepo(({ root, head }) => {
    const finding = budgetFinding(
      root,
      capsuleText({
        head,
        evidence: "e".repeat(4096),
        next: "n".repeat(2048),
        unknowns: "u".repeat(2048),
        review: "r".repeat(2048),
      }),
    );
    assert.ok(finding, "a combined over-cap capsule must trip the budget rule");
    assert.match(finding.detail, /narrative total 10240\/8192/);
  });
});

test("a within-bound capsule stays clean", async () => {
  await withRepo(({ root, head }) => {
    writeCapsule(root, capsuleText({ head }));
    const report = inspectSpineState({ repo: root });
    assert.ok(!report.errors.some((error) => error.rule === RULE), JSON.stringify(report.errors));
    assert.equal(report.status, "clean", JSON.stringify(report.errors));
  });
});

test("the LT registry carries the retention rule", () => {
  assert.ok(registryPage.length > 0, "the LT registry page must be readable");
  for (const phrase of [
    "no adoption decision",
    "Result / non-proof",
    "path",
    "symbol",
    "churn",
    "docs/research/workflow-lessons.md",
    "retired@<7-hex>",
    "capped at 100 non-retired rows",
    "oldest active row",
    "gap-free",
  ]) {
    assert.ok(registryPage.includes(phrase), `the LT registry must carry the retention phrase: ${phrase}`);
  }
});
