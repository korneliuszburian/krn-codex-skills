import assert from "node:assert/strict";
import { runGit } from "../../scripts/lib/support/git-cli.mjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectSpineState } from "../../scripts/lib/state/state-check.mjs";

const git = (root, args) => runGit(root, args).out;

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-friction-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function capsule({ outcome = "ACTIVE", friction = "none", fixedPoint, next = "continue the bounded slice" }) {
  return [
    "Outcome and observable acceptance: test",
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
    `Workflow friction and lesson candidates: ${friction}`,
    "Durable CONTEXT / ADR / research references: none",
    `Next bounded owner and action: ${next}`,
    "",
  ].join("\n");
}

function writeCapsule(root, text) {
  const dir = join(root, ".krn", "runs", "delivery-loop", "out-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.md"), text);
}

function writeLessonAnchor(root) {
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| Drain the candidate at close. | probe evidence | `scripts/lib/state/state-check.mjs` |\n",
  );
}

function writeQueueTicket(root, id) {
  mkdirSync(join(root, ".scratch"), { recursive: true });
  writeFileSync(
    join(root, ".scratch", `${id}.md`),
    [
      "<krn-ticket>",
      `Id: ${id}`,
      "Title: Sample queued ticket",
      "Status: ready",
      "Type: task",
      "Repository-base: main",
      "Scope: scripts/lib/state/",
      "Deciding check: node --test test/state/friction-drain.test.mjs",
      "Contract: test/state/friction-drain.test.mjs:red->green",
      "Acceptance: the candidate resolves to a queued ticket",
      "Blocked by: none",
      "</krn-ticket>",
      "",
    ].join("\n"),
  );
}

function complete(fixedPoint) {
  return { outcome: "COMPLETE", friction: "none", fixedPoint, next: "done" };
}

test("an ACTIVE capsule warns on a dangling candidate instead of accepting it silently", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ friction: "candidate: no-such-anchor", fixedPoint: `HEAD=${head}` }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.warnings.some((warning) => warning.rule === "dangling-candidate"), JSON.stringify(report.warnings));
  assert.ok(!report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  assert.equal(report.status, "clean");
  rmSync(root, { recursive: true, force: true });
});

test("an ACTIVE capsule accepts a candidate that resolves to a lesson-row anchor", () => {
  const { root, head } = makeRepo();
  writeLessonAnchor(root);
  writeCapsule(root, capsule({ friction: "candidate: scripts/lib/state/state-check.mjs", fixedPoint: `HEAD=${head}` }));
  const report = inspectSpineState({ repo: root });
  assert.ok(!report.warnings.some((warning) => warning.rule === "dangling-candidate"), JSON.stringify(report.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("a COMPLETE capsule errors on a dangling candidate", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "candidate: no-such-anchor" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  assert.equal(report.status, "divergent");
  rmSync(root, { recursive: true, force: true });
});

test("a COMPLETE capsule drains a candidate that resolves to a lesson-row anchor", () => {
  const { root, head } = makeRepo();
  writeLessonAnchor(root);
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "candidate: scripts/lib/state/state-check.mjs" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(!report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "complete-with-friction"), JSON.stringify(report.errors));
  assert.equal(report.status, "clean");
  rmSync(root, { recursive: true, force: true });
});

test("a COMPLETE capsule drains a candidate that names a queued ticket", () => {
  const { root, head } = makeRepo();
  writeQueueTicket(root, "sh-42");
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "candidate: sh-42" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(!report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "complete-with-friction"), JSON.stringify(report.errors));
  assert.equal(report.status, "clean");
  rmSync(root, { recursive: true, force: true });
});

test("a COMPLETE capsule drains a deferred candidate that names a queued ticket", () => {
  const { root, head } = makeRepo();
  writeQueueTicket(root, "sh-42");
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "candidate: deferred:sh-42" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(!report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  assert.equal(report.status, "clean");
  rmSync(root, { recursive: true, force: true });
});

test("a deferred candidate naming no queued ticket dangles", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "candidate: deferred:sh-999" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a COMPLETE capsule still blocks on undispositioned friction prose", () => {
  const { root, head } = makeRepo();
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "reviewer skipped the context check" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "complete-with-friction"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("resolved candidates do not excuse undispositioned friction prose", () => {
  const { root, head } = makeRepo();
  writeLessonAnchor(root);
  writeCapsule(root, capsule({ ...complete(`base=${head}; HEAD=${head}; dirty=clean`), friction: "reviewer skipped the context check; candidate: scripts/lib/state/state-check.mjs" }));
  const report = inspectSpineState({ repo: root });
  assert.ok(report.errors.some((error) => error.rule === "complete-with-friction"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((error) => error.rule === "dangling-candidate"), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});
