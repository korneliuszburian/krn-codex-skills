import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectSpineState } from "../scripts/lib/state-check.mjs";

const cli = fileURLToPath(new URL("../scripts/krn-codex.mjs", import.meta.url));

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function makeRepo({ initialCommit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-state-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  if (initialCommit) git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: initialCommit ? git(root, ["rev-parse", "HEAD"]) : null };
}

function capsule({ outcome = "ACTIVE", publication = "LOCAL_ONLY", restart = "ABSENT", cleanup = "none", fixedPoint, friction = "none" }) {
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
    `Workflow friction and lesson candidates: ${friction}`,
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: none",
    "",
  ].join("\n");
}

function writeCapsule(root, text, id = "out-1") {
  const dir = join(root, ".krn", "runs", "delivery-loop", id);
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
  assert.equal(report.applicability, "checked");
  rmSync(root, { recursive: true, force: true });
});

test("an empty repository is not-applicable, not a silent pass", () => {
  const { root } = makeRepo();
  const report = inspectSpineState({ repo: root });
  assert.equal(report.status, "not-applicable");
  assert.equal(report.applicability, "no-file-backed-capsule");
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
    { name: "invalid outcome enum", expected: "invalid-outcome-state", build: () => capsule({ outcome: "DONE", fixedPoint: `HEAD=${head}` }) },
    { name: "invalid publication enum", expected: "invalid-publication-state", build: () => capsule({ publication: "DONE", fixedPoint: `HEAD=${head}` }) },
    { name: "missing restart path", expected: "restart-path-missing", build: () => capsule({ restart: ".krn/runs/delivery-loop/out-1/missing.md", fixedPoint: `HEAD=${head}` }) },
    { name: "restart path outside the repo", expected: "restart-path-outside-repo", build: () => capsule({ restart: "/etc/passwd", fixedPoint: `HEAD=${head}` }) },
    { name: "ghost cleanup entry", expected: "ghost-cleanup-entry", build: () => capsule({ cleanup: "[.krn/runs/slice-work/run-9; slice-work; $delivery-loop; closes; ACTIVE]", fixedPoint: `HEAD=${head}` }) },
    { name: "cleanup pointer outside the repo", expected: "cleanup-pointer-outside-repo", build: () => capsule({ cleanup: "[/etc/passwd; slice-work; $delivery-loop; closes; ACTIVE]", fixedPoint: `HEAD=${head}` }) },
    { name: "invalid fixed point", expected: "invalid-fixed-point", build: () => capsule({ fixedPoint: "HEAD=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }) },
    { name: "partial fixed point token", expected: "invalid-fixed-point", build: () => capsule({ fixedPoint: "HEAD=deadbee" }) },
    { name: "complete with outstanding cleanup", expected: "complete-with-cleanup", build: () => capsule({ outcome: "COMPLETE", cleanup: "[.krn/runs/slice-work/run-1; slice-work; $delivery-loop; closes; CLEANUP_PENDING]", fixedPoint: `HEAD=${head}` }) },
    { name: "complete with restart file", expected: "complete-with-restart", build: () => capsule({ outcome: "COMPLETE", restart: ".krn/runs/delivery-loop/out-1/state.md", fixedPoint: `HEAD=${head}` }) },
    { name: "empty cleanup brackets", expected: "malformed-cleanup", build: () => capsule({ cleanup: "[]", fixedPoint: `HEAD=${head}` }) },
    { name: "empty cleanup fields", expected: "malformed-cleanup", build: () => capsule({ cleanup: "[; ; ; ; ACTIVE]", fixedPoint: `HEAD=${head}` }) },
    { name: "duplicate ABI label", expected: "duplicate-field", build: () => `${capsule({ fixedPoint: `HEAD=${head}` })}Outcome state: ACTIVE\n` },
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

test("a capsule in a non-git directory reports not-a-git-worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-state-nogit-"));
  writeCapsule(root, capsule({ fixedPoint: "fingerprint=working-tree" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(rules(report).includes("not-a-git-worktree"), rules(report).join(","));
  rmSync(root, { recursive: true, force: true });
});

test("a directory named state.md is an unreadable capsule", () => {
  const { root, head } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md"), { recursive: true });
  const report = inspectSpineState({ repo: root });
  assert.ok(rules(report).includes("unreadable-capsule"), rules(report).join(","));
  rmSync(root, { recursive: true, force: true });
});

test("a symlinked capsule directory inside the repo is followed", () => {
  const { root, head } = makeRepo();
  const real = join(root, "real-capsule");
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, "state.md"), capsule({ outcome: "DONE", fixedPoint: `HEAD=${head}` }));
  mkdirSync(join(root, ".krn", "runs", "delivery-loop"), { recursive: true });
  symlinkSync(real, join(root, ".krn", "runs", "delivery-loop", "linked"));
  const report = inspectSpineState({ repo: root });
  assert.equal(report.capsules.length, 1);
  assert.equal(report.status, "divergent");
  assert.ok(rules(report).includes("invalid-outcome-state"));
  rmSync(root, { recursive: true, force: true });
});

test("a symlinked capsule directory outside the repo is rejected", () => {
  const { root } = makeRepo();
  const outside = mkdtempSync(join(tmpdir(), "krn-state-outside-"));
  writeFileSync(join(outside, "state.md"), capsule({ fixedPoint: "fingerprint=working-tree" }));
  mkdirSync(join(root, ".krn", "runs", "delivery-loop"), { recursive: true });
  symlinkSync(outside, join(root, ".krn", "runs", "delivery-loop", "linked"));
  const report = inspectSpineState({ repo: root });
  assert.ok(rules(report).includes("capsule-outside-repo"), rules(report).join(","));
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
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

test("a non-hex working-tree fingerprint is accepted without commit validation", () => {
  const { root } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: "fingerprint=working-tree" }));
  const report = inspectSpineState({ repo: root });
  assert.equal(report.status, "clean", JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a missing git binary is reported, not misattributed", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }));
  const result = spawnSync(process.execPath, [cli, "state", "check", root], {
    env: { ...process.env, PATH: "/nonexistent" },
    encoding: "utf8",
  });
  const report = JSON.parse(result.stdout);
  assert.equal(report.git, false);
  assert.ok(report.errors.some((error) => error.rule === "git-unavailable"), JSON.stringify(report.errors));
  assert.equal(result.status, 1);
  rmSync(root, { recursive: true, force: true });
});

test("a file path is a usage error, not a false pass", () => {
  const { root } = makeRepo();
  const result = spawnSync(process.execPath, [cli, "state", "check", join(root, ".krn", "runs", ".gitignore")], { encoding: "utf8" });
  assert.equal(result.status, 64, result.stderr);
  assert.match(result.stderr, /repository directory/);
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

test("a COMPLETE capsule blocks on undispositioned lesson candidates", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ outcome: "COMPLETE", fixedPoint: `base=${head}; HEAD=${head}; dirty=clean`, friction: "reviewer skipped the context check; candidate gate: state check" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "complete-with-friction"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an over-budget workflow-lessons page diverges", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  const rows = Array.from({ length: 25 }, (_, index) => `| lesson ${index} | evidence | gate |`).join("\n");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by |\n|---|---|---|\n${rows}\n`);
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "lessons-over-budget"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a lesson without an enforcing gate diverges", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A lesson without a gate | probe evidence | |\n");
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "malformed-lesson"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a prose-only acceptance warns without diverging", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ fixedPoint: `HEAD=${head}` }).replace("Outcome and observable acceptance: test", "Outcome and observable acceptance: it works"));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.warnings.some((warning) => warning.rule === "vague-acceptance"), JSON.stringify(report.warnings));
  assert.equal(report.status, "clean");
  rmSync(root, { recursive: true, force: true });
});
