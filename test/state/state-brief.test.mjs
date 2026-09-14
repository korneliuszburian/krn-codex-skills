import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runGit } from "../../scripts/lib/support/git-cli.mjs";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ABI_LABELS } from "../../scripts/lib/state/capsule-abi.mjs";
import { compileCapsule, resumeBrief } from "../../scripts/lib/state/state-brief.mjs";

const git = (root, args) => runGit(root, args).out;

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-brief-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  git(root, ["add", ".krn/runs/.gitignore"]);
  git(root, ["commit", "-q", "-m", "runs boundary"]);
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function writeCapsule(root, fixedPoint, cleanup = "none") {
  const dir = join(root, ".krn", "runs", "delivery-loop", "out-1");
  mkdirSync(dir, { recursive: true });
  const lines = [
    "Outcome and observable acceptance: brief test",
    "Current workflow owner and sole writer: $delivery-loop",
    "Outcome state: ACTIVE",
    "Publication state: LOCAL_ONLY",
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: ${fixedPoint}`,
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    `Outstanding workflow-run cleanup: ${cleanup}`,
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: probe",
    "Explicit non-proofs: probe",
    "Review fixed point and Standards / Spec disposition: none",
    "Open unknowns and blockers with owners: none",
    "Workflow friction and lesson candidates: none",
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: resume brief",
    "",
  ];
  writeFileSync(join(dir, "state.md"), lines.join("\n"));
}

test("resume parses a markup-decorated cleanup and projects restart/goal/durable fields", () => {
  const { root, head } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "slice-work", "one"), { recursive: true });
  writeCapsule(root, `HEAD=${head}`, "`[.krn/runs/slice-work/one; slice-work; alice; closes; ACTIVE]`");
  const report = resumeBrief({ repo: root });
  const text = report.text;
  assert.ok(text.includes(".krn/runs/slice-work/one"), text);
  assert.ok(!/unlisted \.krn\/runs\/slice-work\/one/.test(text), text);
  assert.ok(text.includes("cleanup entries: .krn/runs/slice-work/one"), text);
  assert.ok(text.includes("restart: ABSENT"), text);
  assert.ok(text.includes("goal/tracker: none"), text);
  assert.ok(text.includes("durable refs: none"), text);
  rmSync(root, { recursive: true, force: true });
});

test("compile prefills every ABI field with deterministic repo truth", () => {
  const { root, head } = makeRepo();
  const report = compileCapsule({ repo: root });
  assert.deepEqual(report.errors, []);
  assert.equal(report.head, head);
  for (const label of ABI_LABELS) {
    assert.ok(report.capsule.includes(`${label}:`), `missing ${label}`);
  }
  assert.ok(report.capsule.includes(`HEAD=${head}`));
  assert.ok(report.capsule.includes("dirty=clean"));
  assert.ok(report.capsule.includes("Outstanding workflow-run cleanup: none"));
  assert.equal(report.ignoredRuns, true);
  rmSync(root, { recursive: true, force: true });
});

test("compile inventories active runs and warns about an existing capsule", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "slice-work", "run-1"), { recursive: true });
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md"), "Outcome state: ACTIVE\n");
  const report = compileCapsule({ repo: root });
  assert.ok(report.capsule.includes(".krn/runs/slice-work/run-1; slice-work;"));
  assert.ok(report.capsule.includes("ACTIVE"));
  assert.ok(report.capsules.includes("out-1"));
  assert.ok(report.warnings.some((warning) => warning.includes("already exists")));
  rmSync(root, { recursive: true, force: true });
});

test("resume reports no file-backed capsule without inventing one", () => {
  const { root } = makeRepo();
  const report = resumeBrief({ repo: root });
  assert.equal(report.applicability, "no-file-backed-capsule");
  assert.deepEqual(report.capsules, []);
  assert.match(report.text, /No file-backed outcome capsule/);
  rmSync(root, { recursive: true, force: true });
});

test("resume loads the repository workflow lessons", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs/research/workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| Never skip the gate. | probe | test |\n");
  const report = resumeBrief({ repo: root });
  assert.equal(report.lessons.count, 1);
  assert.match(report.text, /Never skip the gate/);
  rmSync(root, { recursive: true, force: true });
});

test("resume does not resurrect a retired lesson", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(
    join(root, "docs/research/workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n"
    + "| Keep the active rule. | probe | `test:state` | | | | |\n"
    + "| Old advice. | probe | `manual:review` | | | | retired@abcdef0 |\n",
  );
  const report = resumeBrief({ repo: root });
  assert.equal(report.lessons.count, 1);
  assert.deepEqual(report.lessons.items, ["Keep the active rule."]);
  assert.doesNotMatch(report.text, /Old advice/);
  rmSync(root, { recursive: true, force: true });
});

test("resume surfaces blocking errors in the brief", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  const rows = Array.from({ length: 25 }, (_, index) => `| lesson ${index} | evidence | gate |`).join("\n");
  writeFileSync(join(root, "docs/research/workflow-lessons.md"), `| Lesson | Evidence | Enforced by |\n|---|---|---|\n${rows}\n`);
  const report = resumeBrief({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "lessons-over-budget"));
  assert.match(report.text, /lessons-over-budget/);
  rmSync(root, { recursive: true, force: true });
});

test("resume detects dirty scope, a moved HEAD, and unlisted runs", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `base=${head}; HEAD=${head}; dirty=clean`);
  const clean = resumeBrief({ repo: root });
  assert.equal(clean.capsules[0].headMoved, false);
  assert.equal(clean.capsules[0].liveDirty.length, 0);

  writeFileSync(join(root, "dirty.txt"), "wip\n");
  const dirty = resumeBrief({ repo: root });
  assert.ok(dirty.capsules[0].liveDirty.includes("dirty.txt"));

  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "next"]);
  mkdirSync(join(root, ".krn", "runs", "slice-work", "run-2"), { recursive: true });
  const moved = resumeBrief({ repo: root });
  assert.equal(moved.capsules[0].headMoved, true);
  assert.deepEqual(moved.capsules[0].unlistedRuns, [".krn/runs/slice-work/run-2"]);
  rmSync(root, { recursive: true, force: true });
});

test("resume reports cleanup entries whose run directory is gone", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`, "[.krn/runs/slice-work/gone; slice-work; $delivery-loop; closes; ACTIVE]");
  const report = resumeBrief({ repo: root });
  assert.deepEqual(report.capsules[0].missingRuns, [".krn/runs/slice-work/gone"]);
  rmSync(root, { recursive: true, force: true });
});

test("resume normalizes cleanup pointers so a live run is neither missing nor unlisted", () => {
  const { root, head } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "slice-work", "run-1"), { recursive: true });
  writeCapsule(root, `HEAD=${head}`, "[./.krn/runs/slice-work/run-1/; slice-work; $delivery-loop; closes; ACTIVE]");
  const report = resumeBrief({ repo: root });
  assert.deepEqual(report.capsules[0].missingRuns, [], JSON.stringify(report.capsules[0].missingRuns));
  assert.deepEqual(report.capsules[0].unlistedRuns, [], JSON.stringify(report.capsules[0].unlistedRuns));
  rmSync(root, { recursive: true, force: true });
});

test("compile records the full dirty path for a tracked modification", () => {
  const { root } = makeRepo();
  writeFileSync(join(root, "tracked.txt"), "one\n");
  git(root, ["add", "tracked.txt"]);
  git(root, ["commit", "-q", "-m", "tracked file"]);
  writeFileSync(join(root, "tracked.txt"), "one\ntwo\n");
  const report = compileCapsule({ repo: root });
  assert.match(report.capsule, /dirty=1 paths: tracked\.txt/, report.capsule);
  rmSync(root, { recursive: true, force: true });
});

test("resume projects authority, blockers, evidence, non-proofs, and review", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`);
  const file = join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md");
  const text = readFileSync(file, "utf8")
    .replace("push=none", "push=forbidden")
    .replace("Evidence observed: probe", "Evidence observed: ran test:state")
    .replace("Explicit non-proofs: probe", "Explicit non-proofs: no cross-model review")
    .replace("Open unknowns and blockers with owners: none", "Open unknowns and blockers with owners: owner=alice")
    .replace("Review fixed point and Standards / Spec disposition: none", "Review fixed point and Standards / Spec disposition: Standards=green");
  writeFileSync(file, text);
  const report = resumeBrief({ repo: root });
  const brief = report.capsules[0];
  assert.equal(brief.authority, "writes=none; tracker/issue=none; commit=none; push=forbidden; PR=none; merge=none; deployment/install=none");
  assert.match(report.text, /push=forbidden/);
  assert.match(report.text, /ran test:state/);
  assert.match(report.text, /no cross-model review/);
  assert.match(report.text, /owner=alice/);
  assert.match(report.text, /Standards=green/);
  rmSync(root, { recursive: true, force: true });
});

test("a failed git status reports an unknown dirty scope, not clean", () => {
  const { root, head } = makeRepo();
  writeFileSync(join(root, ".git", "index"), "corrupt\n");
  const report = compileCapsule({ repo: root });
  assert.match(report.capsule, /dirty=unknown \(git status failed\)/, report.capsule);
  assert.ok(report.errors.some((error) => error.rule === "dirty-state-unavailable"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("resume reports a failed git status as an error, not a warning", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`);
  writeFileSync(join(root, ".git", "index"), "corrupt\n");
  const report = resumeBrief({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "dirty-state-unavailable"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("an empty projected field renders as none and JSON null", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`);
  const file = join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(/^Authority: .*$/m, "Authority: "));
  const report = resumeBrief({ repo: root });
  assert.equal(report.capsules[0].authority, null);
  assert.match(report.text, /authority: none/);
  rmSync(root, { recursive: true, force: true });
});

test("compile marks the dirty scope unknown outside a git worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-nogit-brief-"));
  try {
    const report = compileCapsule({ repo: root });
    assert.match(report.capsule, /dirty=unknown \(not a git worktree\)/, report.capsule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("headMoved is true when the recorded HEAD differs even if base matches", () => {
  const { root, head } = makeRepo();
  git(root, ["commit", "-q", "--allow-empty", "-m", "second"]);
  const live = git(root, ["rev-parse", "HEAD"]);
  writeCapsule(root, `base=${live}; HEAD=${head}; dirty=clean`);
  const report = resumeBrief({ repo: root });
  assert.equal(report.capsules[0].headMoved, true);
  rmSync(root, { recursive: true, force: true });
});

test("a base-only capsule reports headMoved false and a pending missing run is counted", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `base=${head}; dirty=clean`, "[.krn/runs/slice-work/gone; slice-work; x; closes; CLEANUP_PENDING]");
  const report = resumeBrief({ repo: root });
  assert.equal(report.capsules[0].headMoved, false);
  assert.equal(report.capsules[0].missingRuns.length, 1, JSON.stringify(report.capsules[0].missingRuns));
  rmSync(root, { recursive: true, force: true });
});

test("a fingerprint is not reported as a recorded HEAD", () => {
  const { root, head } = makeRepo();
  writeFileSync(join(root, "blob.txt"), "content\n");
  const blob = execFileSync("git", ["-C", root, "hash-object", "blob.txt"], { encoding: "utf8" }).trim();
  writeCapsule(root, `fingerprint=${blob}; dirty=clean`);
  const report = resumeBrief({ repo: root });
  assert.ok(!report.capsules[0].recordedCommits.includes(blob), JSON.stringify(report.capsules[0].recordedCommits));
  rmSync(root, { recursive: true, force: true });
});

test("resume preserves every cleanup obligation field", () => {
  const { root, head } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "slice-work", "one"), { recursive: true });
  writeCapsule(root, `HEAD=${head}`, "[.krn/runs/slice-work/one; slice-work; alice; closes; ACTIVE]");
  const report = resumeBrief({ repo: root });
  const entry = report.capsules[0].cleanupEntries[0];
  assert.equal(entry.workflow, "slice-work");
  assert.equal(entry.consumer, "alice");
  assert.equal(entry.trigger, "closes");
  assert.equal(entry.state, "ACTIVE");
  assert.match(report.text, /alice/);
  rmSync(root, { recursive: true, force: true });
});

test("an unreadable inventory is reported once with a relative detail", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`);
  symlinkSync(join(root, ".krn", "runs", "missing-target"), join(root, ".krn", "runs", "slice-work"));
  const report = compileCapsule({ repo: root });
  const inventory = report.errors.filter((error) => error.rule === "unreadable-run-inventory");
  assert.equal(inventory.length, 1, JSON.stringify(report.errors));
  assert.ok(!inventory[0].detail.includes(root), inventory[0].detail);
  rmSync(root, { recursive: true, force: true });
});

test("resume reports an unreadable inventory exactly once", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, `HEAD=${head}`);
  symlinkSync(join(root, ".krn", "runs", "missing-target"), join(root, ".krn", "runs", "slice-work"));
  const report = resumeBrief({ repo: root });
  assert.equal(report.errors.filter((error) => error.rule === "unreadable-run-inventory").length, 1, JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("compile reports an unreadable capsule store instead of throwing", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-capsule-store-"));
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", "delivery-loop"), "not a directory\n");
  let report;
  assert.doesNotThrow(() => { report = compileCapsule({ repo: root }); });
  assert.ok(report.errors.some((error) => error.rule === "unreadable-capsule-store"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("resume does not crash on a directory state.md", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md"), { recursive: true });
  let report;
  assert.doesNotThrow(() => { report = resumeBrief({ repo: root }); });
  assert.ok(report.errors.some((error) => error.rule === "unreadable-capsule"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("compile surfaces a dangling capsule state.md and excludes it as live", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1"), { recursive: true });
  symlinkSync(join(root, "missing-state"), join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md"));
  const report = compileCapsule({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "unreadable-capsule"), JSON.stringify(report.errors));
  assert.ok(!report.capsules.includes("out-1"), JSON.stringify(report.capsules));
  rmSync(root, { recursive: true, force: true });
});

test("resume reports a dangling capsule state.md once and does not throw", () => {
  const { root } = makeRepo();
  mkdirSync(join(root, ".krn", "runs", "delivery-loop", "out-1"), { recursive: true });
  symlinkSync(join(root, "missing-state"), join(root, ".krn", "runs", "delivery-loop", "out-1", "state.md"));
  let report;
  assert.doesNotThrow(() => { report = resumeBrief({ repo: root }); });
  assert.equal(report.errors.filter((error) => error.rule === "unreadable-capsule").length, 1, JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});
