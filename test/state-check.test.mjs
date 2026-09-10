import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectSpineState } from "../scripts/lib/state-check.mjs";

const cli = fileURLToPath(new URL("../scripts/krn-codex.mjs", import.meta.url));

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-state-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function capsule({ outcome = "ACTIVE", publication = "LOCAL_ONLY", restart = "ABSENT", cleanup = "none", fixedPoint }) {
  return [
    "Outcome and observable acceptance: test",
    "Current workflow owner and sole writer: $delivery-loop",
    `Outcome state: ${outcome}`,
    `Publication state: ${publication}`,
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: ${fixedPoint}`,
    "Native Goal identity/state and configured tracker item/state: none",
    `Restart state: ${restart}`,
    `Outstanding workflow-run cleanup: ${cleanup}`,
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: none",
    "Explicit non-proofs: none",
    "Review fixed point and Standards / Spec disposition: none",
    "Open unknowns and blockers with owners: none",
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: none",
    "",
  ].join("\n");
}

function writeCapsule(root, text) {
  const dir = join(root, ".krn", "runs", "delivery-loop", "out-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.md"), text);
}

function rules(report) {
  return report.errors.map((error) => error.rule);
}

test("a structurally clean capsule passes with the generated runs layout", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `base=${head}, HEAD=${head}, dirty=none` }));
  const report = inspectSpineState({ repo: root });
  assert.equal(report.status, "clean", JSON.stringify(report.errors));
  assert.deepEqual(report.errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("multiple cleanup entries parse and do not malform", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ cleanup: "[<.a; wf; c; t; CLEANUP_PENDING>, <.b; wf; c; t; CLEANUP_PENDING>]", fixedPoint: `HEAD=${head}` }));
  const report = inspectSpineState({ repo: root });
  assert.equal(report.status, "clean", JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("each injected divergence class fails", () => {
  const head = "0".repeat(40);
  const cases = [
    {
      name: "invalid outcome enum",
      expected: "invalid-outcome-state",
      build: () => capsule({ outcome: "DONE", fixedPoint: `HEAD=${head}` }),
    },
    {
      name: "missing restart path",
      expected: "restart-path-missing",
      build: () => capsule({ restart: ".krn/runs/delivery-loop/out-1/missing.md", fixedPoint: `HEAD=${head}` }),
    },
    {
      name: "ghost cleanup entry",
      expected: "ghost-cleanup-entry",
      build: () => capsule({ cleanup: "[.krn/runs/slice-work/run-9; slice-work; $delivery-loop; closes; ACTIVE]", fixedPoint: `HEAD=${head}` }),
    },
    {
      name: "invalid fixed point",
      expected: "invalid-fixed-point",
      build: () => capsule({ fixedPoint: "HEAD=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }),
    },
    {
      name: "complete with outstanding cleanup",
      expected: "complete-with-cleanup",
      build: () => capsule({ outcome: "COMPLETE", cleanup: "[.krn/runs/slice-work/run-1; slice-work; $delivery-loop; closes; CLEANUP_PENDING]", fixedPoint: `HEAD=${head}` }),
    },
    {
      name: "empty cleanup brackets",
      expected: "malformed-cleanup",
      build: () => capsule({ cleanup: "[]", fixedPoint: `HEAD=${head}` }),
    },
  ];

  for (const entry of cases) {
    const { root } = makeRepo();
    writeCapsule(root, entry.build());
    const report = inspectSpineState({ repo: root });
    assert.equal(report.status, "divergent", `${entry.name} must be divergent`);
    assert.ok(rules(report).includes(entry.expected), `${entry.name} must report ${entry.expected}: ${rules(report).join(",")}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty ABI value counts as a missing field", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }).replace("Outcome state: ACTIVE", "Outcome state: "));
  const report = inspectSpineState({ repo: root });
  assert.ok(rules(report).includes("missing-field"));
  rmSync(root, { recursive: true, force: true });
});

test("an unignored capsule fails before capsule trust", () => {
  const { root, head } = makeRepo();
  rmSync(join(root, ".krn", "runs", ".gitignore"));
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }));
  const report = inspectSpineState({ repo: root });
  assert.ok(rules(report).includes("runs-not-ignored"));
  rmSync(root, { recursive: true, force: true });
});

test("a valid older fixed point warns instead of failing", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }));
  git(root, ["commit", "-q", "--allow-empty", "-m", "advance"]);
  const report = inspectSpineState({ repo: root });
  assert.equal(report.status, "clean");
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((warning) => warning.rule === "stale-fixed-point"));
  rmSync(root, { recursive: true, force: true });
});

test("the CLI resolves the repository top level and returns terminal exit codes", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }));
  const nested = join(root, "nested", "deeper");
  mkdirSync(nested, { recursive: true });
  const clean = spawnSync(process.execPath, [cli, "state", "check"], { cwd: nested, encoding: "utf8" });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  writeCapsule(root, capsule({ outcome: "DONE", fixedPoint: `HEAD=${head}` }));
  const divergent = spawnSync(process.execPath, [cli, "state", "check"], { cwd: nested, encoding: "utf8" });
  assert.equal(divergent.status, 1, divergent.stdout + divergent.stderr);
  rmSync(root, { recursive: true, force: true });
});
