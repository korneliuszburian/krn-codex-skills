import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(REPO, "scripts", "krn-codex.mjs");
const PROJECT = path.join(path.dirname(fileURLToPath(import.meta.url)), "project");

function sourceFixture(root) {
  const source = path.join(root, "source");
  fs.cpSync(REPO, source, {
    recursive: true,
    filter(candidate) {
      return ![".git", ".krn", "node_modules"].includes(path.basename(candidate));
    },
  });
  execFileSync("git", ["init", "--quiet", source]);
  execFileSync("git", ["-C", source, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", source, "config", "user.name", "KRN bootstrap fixture"]);
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", ["-C", source, "commit", "--quiet", "-m", "bootstrap fixture source"]);
  return source;
}

function environment(root, extra = {}) {
  return {
    ...process.env,
    CODEX_HOME: path.join(root, "codex"),
    KRN_SKILLS_DEST: path.join(root, "skills"),
    KRN_BIN_DEST: path.join(root, "bin"),
    KRN_OPENCODE_DEST: path.join(root, "opencode"),
    ...extra,
  };
}

function invoke(command, args, root, extra = {}) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    env: environment(root, extra),
    encoding: "utf8",
  });
}

function snapshot(root) {
  const files = [];
  function visit(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const relative = path.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute, relative);
      else files.push([relative, stat.isSymbolicLink() ? `link:${fs.readlinkSync(absolute)}` : fs.readFileSync(absolute, "utf8")]);
    }
  }
  visit(root);
  return files.sort((left, right) => left[0].localeCompare(right[0]));
}

function initTarget(root) {
  const target = path.join(root, "target");
  fs.cpSync(PROJECT, target, { recursive: true });
  execFileSync("git", ["init", "--quiet", target]);
  execFileSync("git", ["-C", target, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", target, "config", "user.name", "KRN bootstrap fixture"]);
  execFileSync("git", ["-C", target, "commit", "-q", "--allow-empty", "-m", "seed"]);
  return target;
}

function fixtureCapsule({ outcome, cleanup, fixedPoint = "fingerprint=working-tree" }) {
  return [
    "Outcome and observable acceptance: fixture",
    "Current workflow owner and sole writer: $delivery-loop",
    `Outcome state: ${outcome}`,
    "Publication state: LOCAL_ONLY",
    `Repository base, HEAD or working-tree fingerprint, and dirty-state scope: ${fixedPoint}`,
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    `Outstanding workflow-run cleanup: ${cleanup}`,
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: none",
    "Explicit non-proofs: none",
    "Review fixed point and Standards / Spec disposition: none",
    "Open unknowns and blockers with owners: none",
    "Workflow friction and lesson candidates: none",
    "Durable CONTEXT / ADR / research references: none",
    "Next bounded owner and action: continue the fixture slice",
    "",
  ].join("\n");
}

test("installed CLI bootstraps a target repository through its public seam", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-bootstrap-fixture-"));
  try {
    const source = sourceFixture(root);
    const installed = invoke(CLI, ["install", "apply", "--source", source, "--yes", "--json"], root);
    assert.equal(installed.status, 0, installed.stderr);
    const installedCli = path.join(root, "bin", "krn-codex");
    assert.equal(fs.readlinkSync(installedCli), path.join(root, "codex", "krn", "current", "scripts", "krn-codex.mjs"));
    assert.equal(fs.realpathSync(installedCli), path.join(root, "codex", "krn", "releases", JSON.parse(installed.stdout).commit, "scripts", "krn-codex.mjs"));

    const target = initTarget(root);
    const fixtureHead = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const beforeInspect = snapshot(target);
    const foreign = fs.readFileSync(path.join(target, "LOCAL.md"), "utf8");
    const inspect = invoke(installedCli, ["repo", "inspect", "--root", target], root);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).instruction, "missing");
    assert.deepEqual(snapshot(target), beforeInspect);

    const first = invoke(installedCli, ["repo", "apply", "--root", target, "--tracker", "none", "--domain", "single", "--delivery", "local"], root);
    assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout);
    assert.deepEqual(firstReport.written.sort(), [".krn/runs/.gitignore", "AGENTS.md", "docs/research/workflow-lessons.md"]);
    const agents = fs.readFileSync(path.join(target, "AGENTS.md"), "utf8");
    assert.match(agents, /krn-codex state check/);
    const runsGitignore = fs.readFileSync(path.join(target, ".krn", "runs", ".gitignore"), "utf8");
    assert.equal(fs.readFileSync(path.join(target, ".krn", "runs", ".gitignore"), "utf8"), "# generated by setup-repository-workflow\n*\n!.gitignore\n");

    const second = invoke(installedCli, ["repo", "apply", "--root", target, "--tracker", "none", "--domain", "single", "--delivery", "local"], root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(second.stdout).written.sort(), [".krn/runs/.gitignore", "AGENTS.md"]);
    assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), agents);
    assert.equal(fs.readFileSync(path.join(target, "LOCAL.md"), "utf8"), foreign);
    assert.equal(fs.readFileSync(path.join(target, ".krn", "runs", ".gitignore"), "utf8"), runsGitignore);

    const notApplicable = invoke(installedCli, ["state", "check", target], root);
    assert.equal(notApplicable.status, 0, notApplicable.stderr);
    assert.equal(JSON.parse(notApplicable.stdout).status, "not-applicable");

    const capsuleDir = path.join(target, ".krn", "runs", "delivery-loop", "fixture");
    fs.mkdirSync(capsuleDir, { recursive: true });
    const capsulePath = path.join(capsuleDir, "state.md");
    fs.writeFileSync(capsulePath, fixtureCapsule({ outcome: "DONE", cleanup: "none" }));
    const divergent = invoke(installedCli, ["state", "check", target], root);
    assert.equal(divergent.status, 1, divergent.stderr);
    assert.ok(JSON.parse(divergent.stdout).errors.some((error) => error.rule === "invalid-outcome-state"));

    const runDir = path.join(target, ".krn", "runs", "slice-work", "run-life");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "manifest.md"), "owner: $slice-work\nconsumer: $delivery-loop\n");
    fs.writeFileSync(capsulePath, fixtureCapsule({ outcome: "ACTIVE", cleanup: "[.krn/runs/slice-work/run-life; slice-work; $delivery-loop; closes; ACTIVE]" }));
    const active = invoke(installedCli, ["state", "check", target], root);
    assert.equal(active.status, 0, active.stderr);
    assert.equal(JSON.parse(active.stdout).status, "clean");

    fs.writeFileSync(capsulePath, fixtureCapsule({ outcome: "COMPLETE", cleanup: "[.krn/runs/slice-work/run-life; slice-work; $delivery-loop; closes; ACTIVE]", fixedPoint: `HEAD=${fixtureHead}` }));
    const premature = invoke(installedCli, ["state", "check", target], root);
    assert.equal(premature.status, 1, premature.stderr);
    assert.ok(JSON.parse(premature.stdout).errors.some((error) => error.rule === "complete-with-cleanup"));

    fs.rmSync(runDir, { recursive: true, force: true });
    fs.writeFileSync(capsulePath, fixtureCapsule({ outcome: "COMPLETE", cleanup: "none", fixedPoint: `HEAD=${fixtureHead}` }));
    const completed = invoke(installedCli, ["state", "check", target], root);
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(JSON.parse(completed.stdout).status, "clean");

    fs.writeFileSync(path.join(target, ".krn", "runs", ".gitignore"), "operator-owned\n");
    const beforeCollision = fs.readFileSync(path.join(target, "AGENTS.md"), "utf8");
    const collisionFileBefore = fs.readFileSync(path.join(target, ".krn", "runs", ".gitignore"), "utf8");
    const collision = invoke(installedCli, ["repo", "apply", "--root", target, "--tracker", "none", "--domain", "single", "--delivery", "local"], root);
    assert.equal(collision.status, 64);
    assert.match(collision.stderr, /unowned managed file collision/);
    assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), beforeCollision);
    assert.equal(fs.readFileSync(path.join(target, ".krn", "runs", ".gitignore"), "utf8"), collisionFileBefore);

    const capability = invoke(installedCli, ["capability", "inventory", "--json"], root);
    assert.equal(capability.status, 0, capability.stderr);
    assert.equal(JSON.parse(capability.stdout).capability_states.inventory, "discovered_candidate");

    // The installed release wires the public `skills export` command: it loads
    // from the archive and fails closed on the missing upstream checkout. The
    // archive-as-source acceptance (no `.git`, provenance from `.krn-release.json`)
    // is locked by test/install/skills-export.test.mjs, which can supply a pinned
    // upstream and therefore reaches the source check; the smoke cannot.
    const exportFromRelease = invoke(installedCli, ["skills", "export", "--root", target, "--upstream", path.join(root, "no-upstream")], root);
    assert.equal(exportFromRelease.status, 64, exportFromRelease.stdout + exportFromRelease.stderr);
    assert.match(exportFromRelease.stderr, /upstream checkout missing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
