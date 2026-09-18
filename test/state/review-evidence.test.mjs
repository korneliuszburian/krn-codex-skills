import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGit } from "../../scripts/lib/support/git-cli.mjs";
import { writeCapsule } from "../support/state-fixtures.mjs";

const REVIEW_FIELD = "Review fixed point and Standards / Spec disposition";

function seedRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-review-evidence-"));
  const git = (args) => runGit(root, args).out;
  git(["init", "-q"]);
  git(["config", "user.email", "lab@krn.local"]);
  git(["config", "user.name", "lab"]);
  git(["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: git(["rev-parse", "HEAD"]) };
}

function completeCapsule(head, evidence) {
  return [
    "Outcome and observable acceptance: test",
    "Current workflow owner and sole writer: $delivery-loop",
    "Outcome state: COMPLETE",
    "Publication state: LOCAL_ONLY",
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: HEAD=${head}; dirty=clean`,
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    "Outstanding workflow-run cleanup: none",
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: none",
    "Explicit non-proofs: none",
    `${REVIEW_FIELD}: inspected; evidence=${evidence}`,
    "Open unknowns and blockers with owners: none",
    "Workflow friction and lesson candidates: none",
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: done",
    "",
  ].join("\n");
}

async function errorRules(root) {
  const { inspectSpineState } = await import("../../scripts/lib/state/state-check.mjs");
  return inspectSpineState({ repo: root }).errors.map((error) => error.rule);
}

async function withRepo(run) {
  const { root, head } = seedRepo();
  try {
    return await run({ root, head });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a bare review evidence token is unresolved", async () => {
  await withRepo(async ({ root, head }) => {
    writeCapsule(root, completeCapsule(head, "passed"));
    const rules = await errorRules(root);
    assert.ok(rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});

test("a command-shaped review evidence token is unresolved", async () => {
  await withRepo(async ({ root, head }) => {
    writeCapsule(root, completeCapsule(head, "test:state"));
    const rules = await errorRules(root);
    assert.ok(rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});

test("a review evidence token naming a frozen conformance case resolves", async () => {
  await withRepo(async ({ root, head }) => {
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "config", "conformance.json"), JSON.stringify({ cases: [{ id: "review-case" }] }));
    writeCapsule(root, completeCapsule(head, "case:review-case"));
    const rules = await errorRules(root);
    assert.ok(!rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});

test("a review evidence token naming an absent conformance case is unresolved", async () => {
  await withRepo(async ({ root, head }) => {
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "config", "conformance.json"), JSON.stringify({ cases: [{ id: "review-case" }] }));
    writeCapsule(root, completeCapsule(head, "case:absent"));
    const rules = await errorRules(root);
    assert.ok(rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});

test("a review evidence token naming an existing repository path resolves", async () => {
  await withRepo(async ({ root, head }) => {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "review.md"), "evidence\n");
    writeCapsule(root, completeCapsule(head, "docs/review.md"));
    const rules = await errorRules(root);
    assert.ok(!rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});

test("a review evidence token naming a missing repository path is unresolved", async () => {
  await withRepo(async ({ root, head }) => {
    writeCapsule(root, completeCapsule(head, "docs/missing-report.md"));
    const rules = await errorRules(root);
    assert.ok(rules.includes("complete-review-evidence-unresolved"), rules.join(","));
  });
});
