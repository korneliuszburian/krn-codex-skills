import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectSpineState } from "../../scripts/lib/state/state-check.mjs";
import { runGit } from "../../scripts/lib/support/git-cli.mjs";
import { writeCapsule } from "../support/state-fixtures.mjs";

const git = (root, args) => runGit(root, args).out;

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-acceptance-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function capsule({ outcome = "ACTIVE", acceptance = "test", fixedPoint = "" } = {}) {
  return [
    `Outcome and observable acceptance: ${acceptance}`,
    "Current workflow owner and sole writer: $delivery-loop",
    `Outcome state: ${outcome}`,
    "Publication state: LOCAL_ONLY",
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: ${fixedPoint}`,
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    "Outstanding workflow-run cleanup: none",
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: none",
    "Explicit non-proofs: none",
    "Review fixed point and Standards / Spec disposition: none",
    "Open unknowns and blockers with owners: none",
    "Workflow friction and lesson candidates: none",
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: continue the bounded slice",
    "",
  ].join("\n");
}

const errorRules = (report) => report.errors.map((error) => error.rule);
const warningRules = (report) => report.warnings.map((warning) => warning.rule);

test("a COMPLETE capsule with a todo acceptance item diverges", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({
      outcome: "COMPLETE",
      fixedPoint: `HEAD=${head}`,
      acceptance: "[the CLI exits 0; pass, the ledger survives a resume; todo]",
    }));
    const report = inspectSpineState({ repo: root });
    assert.equal(report.status, "divergent");
    assert.ok(errorRules(report).includes("complete-with-open-acceptance"), errorRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a COMPLETE capsule whose items all passed or were dropped does not diverge", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({
      outcome: "COMPLETE",
      fixedPoint: `HEAD=${head}`,
      acceptance: "[the CLI exits 0; pass, the retired flag; drop: replaced by the ledger]",
    }));
    const report = inspectSpineState({ repo: root });
    assert.equal(report.status, "clean", JSON.stringify(report.errors));
    assert.ok(!errorRules(report).includes("complete-with-open-acceptance"), errorRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ACTIVE capsule without an acceptance ledger warns", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}`, acceptance: "it works" }));
    const report = inspectSpineState({ repo: root });
    assert.ok(warningRules(report).includes("acceptance-without-ledger"), warningRules(report).join(","));
    assert.ok(!errorRules(report).includes("acceptance-without-ledger"), errorRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ACTIVE capsule with a ledger does not warn about a missing ledger", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}`, acceptance: "[the CLI exits 0; todo]" }));
    const report = inspectSpineState({ repo: root });
    assert.ok(!warningRules(report).includes("acceptance-without-ledger"), warningRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed acceptance ledger item diverges", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}`, acceptance: "[the CLI exits 0; bogus]" }));
    const report = inspectSpineState({ repo: root });
    assert.ok(errorRules(report).includes("malformed-acceptance"), errorRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a drop without a reason is a malformed acceptance item", () => {
  const { root, head } = makeRepo();
  try {
    writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}`, acceptance: "[the CLI exits 0; drop]" }));
    const report = inspectSpineState({ repo: root });
    assert.ok(errorRules(report).includes("malformed-acceptance"), errorRules(report).join(","));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
