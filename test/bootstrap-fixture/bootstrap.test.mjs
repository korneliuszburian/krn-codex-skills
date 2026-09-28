import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(REPO, "scripts", "krn.mjs");
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
    const installedCli = path.join(root, "bin", "krn");
    assert.equal(fs.readlinkSync(installedCli), path.join(root, "codex", "krn", "current", "scripts", "krn.mjs"));
    assert.equal(fs.realpathSync(installedCli), path.join(root, "codex", "krn", "releases", JSON.parse(installed.stdout).commit, "scripts", "krn.mjs"));
    assert.equal(fs.existsSync(path.join(root, "bin", "krn-codex")), false, "the retired alias link must not be installed");

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
    assert.match(agents, /krn state check/);
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

test("frozen installed CLI and host adapters use the selected public task queue", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-installed-task-"));
  try {
    const source = sourceFixture(root);
    const installed = invoke(CLI, ["install", "apply", "--source", source, "--yes", "--json"], root);
    assert.equal(installed.status, 0, installed.stderr);
    const commit = JSON.parse(installed.stdout).commit;
    const release = path.join(root, "codex", "krn", "releases", commit);
    const installedCli = path.join(root, "bin", "krn");
    const installedHook = path.join(root, "codex", "hooks", "krn_capsule.py");
    const installedPlugin = path.join(root, "opencode", "plugins", "krn.js");
    assert.equal(fs.realpathSync(installedCli), path.join(release, "scripts", "krn.mjs"));
    assert.equal(fs.realpathSync(installedHook), path.join(release, "scripts", "hooks", "krn_capsule.py"));
    assert.equal(fs.realpathSync(installedPlugin), path.join(release, "config", "opencode", "plugins", "krn.js"));
    const command = (...args) => {
      const result = invoke(installedCli, [...args, "--json"], root);
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
      return JSON.parse(result.stdout);
    };

    const target = initTarget(root);
    const applied = invoke(installedCli, ["repo", "apply", "--root", target, "--tracker", "local", "--domain", "single", "--delivery", "local"], root);
    assert.equal(applied.status, 0, applied.stderr);
    for (const id of ["selected-first", "selected-second"]) {
      assert.equal(command("task", "add", "--root", target, "--id", id, "--title", id).status, "open");
      assert.equal(command("task", "ready", "--root", target, "--id", id).status, "ready");
    }
    const legacy = path.join(target, ".krn", "tickets", "legacy-decoy.md");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, [
      "<krn-ticket>", "Id: legacy-decoy", "Title: Legacy decoy", "Status: ready", "Type: task",
      "Repository-base: HEAD", "Scope: README.md", "Deciding check: true",
      "Contract: test:bootstrap:red->green", "Acceptance: old queue stays separate", "Blocked by: none",
      "</krn-ticket>", "",
    ].join("\n"));
    assert.deepEqual(command("task", "next", "--root", target).frontier, ["selected-first", "selected-second"]);
    assert.deepEqual(command("task", "check", "--root", target).errors, []);

    const hookContext = () => {
      const result = spawnSync("python3", ["-B", installedHook], {
        input: JSON.stringify({ hook_event_name: "SessionStart", cwd: target }),
        encoding: "utf8", env: environment(root),
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : null;
    };
    const plugin = await import(pathToFileURL(installedPlugin).href);
    const adapter = await plugin.KrnAdapter({ directory: target });
    const system = [];
    await adapter["experimental.chat.system.transform"]({ sessionID: "frozen-host" }, { system });
    assert.equal(system.length, 1, "the installed plugin callback injects exactly one system brief");
    for (const brief of [hookContext(), system[0]]) {
      assert.match(brief, /selected-first, selected-second/);
      assert.match(brief, /krn task claim --root/);
      assert.doesNotMatch(brief, /legacy-decoy/);
    }
    const before = execFileSync("git", ["-C", target, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim();
    const claimed = command("task", "claim", "--root", target, "--id", "selected-first", "--worker", "fixture", "--session", "frozen-host");
    assert.equal(claimed.owner, "fixture");
    assert.notEqual(execFileSync("git", ["-C", target, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim(), before);
    assert.match(command("task", "show", "--root", target, "--id", "selected-first").Claim, /worker=fixture/);
    assert.deepEqual(command("task", "next", "--root", target).frontier, ["selected-second"]);

    execFileSync("git", ["-C", target, "update-ref", "-d", "refs/krn/queue-active"]);
    const refused = invoke(installedCli, ["task", "next", "--root", target, "--json"], root);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /Git-ref task queue is not active/);
    assert.equal(hookContext(), null);
    const lostSelectorSystem = [];
    await adapter["experimental.chat.system.transform"]({ sessionID: "lost-selector" }, { system: lostSelectorSystem });
    assert.deepEqual(lostSelectorSystem, [], "the installed OpenCode callback does not revive the legacy queue");
    const { checkTickets } = await import(pathToFileURL(path.join(release, "scripts", "lib", "ticket", "ticket.mjs")).href);
    const decoy = checkTickets({ root: target });
    assert.deepEqual(decoy.errors, []);
    assert.deepEqual(decoy.frontier, ["legacy-decoy"], "historical Markdown remains a readable negative control");
    const retired = invoke(installedCli, ["ticket", "next", "--root", target, "--path", ".krn/tickets", "--json"], root);
    assert.equal(retired.status, 64);
    assert.match(retired.stderr, /krn ticket retired; use krn task/);
    assert.equal(retired.stdout, "", "the installed CLI must not return an executable legacy frontier");
    assert.match(fs.readFileSync(legacy, "utf8"), /Status: ready/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("frozen prior and sealed task-only releases preserve queue state across cutover and rollback", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-task-cutover-"));
  try {
    const oldSource = path.join(root, "old-source");
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", REPO, oldSource]);
    execFileSync("git", ["-C", oldSource, "checkout", "--quiet", "--detach", "0aa0945adaded7de2af507de36b23cbaa4fb7a0f"]);
    const oldInstall = invoke(CLI, ["install", "apply", "--source", oldSource, "--yes", "--json"], root);
    assert.equal(oldInstall.status, 0, `${oldInstall.stdout}${oldInstall.stderr}`);
    const oldCommit = JSON.parse(oldInstall.stdout).commit;
    const installedCli = path.join(root, "bin", "krn");
    const target = initTarget(root);
    const apply = invoke(installedCli, ["repo", "apply", "--root", target, "--tracker", "local", "--domain", "single", "--delivery", "local"], root);
    assert.equal(apply.status, 0, apply.stderr);
    for (const id of ["cutover-work", "rollback-ready"]) {
      const added = invoke(installedCli, ["task", "add", "--root", target, "--id", id, "--title", id, "--json"], root);
      assert.equal(added.status, 0, added.stderr);
      const ready = invoke(installedCli, ["task", "ready", "--root", target, "--id", id, "--json"], root);
      assert.equal(ready.status, 0, ready.stderr);
    }
    const oldAlias = invoke(installedCli, ["ticket", "next", "--root", target, "--json"], root);
    assert.equal(oldAlias.status, 0, oldAlias.stderr);
    assert.deepEqual(JSON.parse(oldAlias.stdout).frontier, ["cutover-work", "rollback-ready"]);
    const exportBefore = invoke(installedCli, ["task", "store", "export", "--root", target, "--json"], root);
    assert.equal(exportBefore.status, 0, exportBefore.stderr);
    const archive = JSON.parse(exportBefore.stdout);
    assert.deepEqual(archive.refs.map((ref) => ref.name), ["refs/krn/queue", "refs/krn/queue-active"]);

    const nextSource = sourceFixture(root);
    const seal = invoke(CLI, ["install", "seal", "--source", nextSource, "--root", nextSource, "--json"], root);
    assert.equal(seal.status, 0, `${seal.stdout}${seal.stderr}`);
    execFileSync("git", ["-C", nextSource, "add", "config/release-digests.json"]);
    execFileSync("git", ["-C", nextSource, "commit", "-q", "-m", "seal fixture task cutover"]);
    const nextInstall = invoke(CLI, ["install", "apply", "--source", nextSource, "--yes", "--json"], root);
    assert.equal(nextInstall.status, 0, `${nextInstall.stdout}${nextInstall.stderr}`);
    const nextCommit = JSON.parse(nextInstall.stdout).commit;
    assert.notEqual(nextCommit, oldCommit);
    assert.equal(fs.realpathSync(installedCli), path.join(root, "codex", "krn", "releases", nextCommit, "scripts", "krn.mjs"));
    const retired = invoke(installedCli, ["ticket", "next", "--root", target, "--json"], root);
    assert.equal(retired.status, 64);
    assert.match(retired.stderr, /krn ticket retired; use krn task/);
    assert.equal(retired.stdout, "");
    const taskNext = invoke(installedCli, ["task", "next", "--root", target, "--json"], root);
    assert.equal(taskNext.status, 0, taskNext.stderr);
    assert.deepEqual(JSON.parse(taskNext.stdout).frontier, ["cutover-work", "rollback-ready"]);
    const exportAfter = invoke(installedCli, ["task", "store", "export", "--root", target, "--json"], root);
    assert.equal(exportAfter.status, 0, exportAfter.stderr);
    assert.deepEqual(JSON.parse(exportAfter.stdout).refs, archive.refs, "install does not rewrite task IDs, history, or selector refs");

    const firstClaim = invoke(installedCli, ["task", "claim", "--root", target, "--id", "cutover-work", "--worker", "operator", "--json"], root);
    assert.equal(firstClaim.status, 0, firstClaim.stderr);
    const firstEpoch = JSON.parse(firstClaim.stdout).epoch;
    const firstClose = invoke(installedCli, ["task", "close", "--root", target, "--id", "cutover-work", "--actor", "operator", "--expected-epoch", String(firstEpoch), "--reason", "first observed result", "--json"], root);
    assert.equal(firstClose.status, 0, firstClose.stderr);
    const reopen = invoke(installedCli, ["task", "reopen", "--root", target, "--id", "cutover-work", "--actor", "operator", "--reason", "verify renewed generation", "--json"], root);
    assert.equal(reopen.status, 0, reopen.stderr);
    const readyAgain = invoke(installedCli, ["task", "ready", "--root", target, "--id", "cutover-work", "--json"], root);
    assert.equal(readyAgain.status, 0, readyAgain.stderr);
    const claimed = invoke(installedCli, ["task", "claim", "--root", target, "--id", "cutover-work", "--worker", "operator", "--json"], root);
    assert.equal(claimed.status, 0, claimed.stderr);
    const epoch = JSON.parse(claimed.stdout).epoch;
    assert.equal(epoch, firstEpoch + 1);
    const linked = path.join(root, "linked");
    execFileSync("git", ["-C", target, "worktree", "add", "--detach", "--quiet", linked]);
    const beforeStale = execFileSync("git", ["-C", target, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim();
    const stale = invoke(installedCli, ["task", "comment", "--root", linked, "--id", "cutover-work", "--worker", "operator", "--expected-epoch", String(epoch - 1), "--body", "stale linked writer", "--json"], root);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale claim generation/, "a reused worker name cannot write with an old claim epoch");
    assert.equal(execFileSync("git", ["-C", target, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim(), beforeStale,
      "a stale linked worktree cannot move the shared queue ref");
    const comment = invoke(installedCli, ["task", "comment", "--root", linked, "--id", "cutover-work", "--worker", "operator", "--expected-epoch", String(epoch), "--body", "same shared queue", "--json"], root);
    assert.equal(comment.status, 0, comment.stderr);
    const closed = invoke(installedCli, ["task", "close", "--root", target, "--id", "cutover-work", "--actor", "operator", "--expected-epoch", String(epoch), "--reason", "operator read back the result", "--json"], root);
    assert.equal(closed.status, 0, closed.stderr);
    const shown = invoke(installedCli, ["task", "show", "--root", linked, "--id", "cutover-work", "--json"], root);
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(JSON.parse(shown.stdout).Status, "done");
    assert.deepEqual(JSON.parse(shown.stdout).task.history.map((entry) => entry.type),
      ["added", "ready", "claimed", "closed", "reopened", "ready", "claimed", "comment", "closed"]);
    const postCutoverExport = invoke(installedCli, ["task", "store", "export", "--root", target, "--json"], root);
    assert.equal(postCutoverExport.status, 0, postCutoverExport.stderr);
    const postCutoverArchive = JSON.parse(postCutoverExport.stdout);
    const archivePath = path.join(root, "post-cutover-queue.json");
    fs.writeFileSync(archivePath, postCutoverExport.stdout);

    const current = path.join(root, "codex", "krn", "current");
    const replacement = `${current}.rollback-fixture`;
    fs.symlinkSync(`releases/${oldCommit}`, replacement);
    fs.renameSync(replacement, current);
    assert.equal(fs.realpathSync(installedCli), path.join(root, "codex", "krn", "releases", oldCommit, "scripts", "krn.mjs"));
    const rolledBack = invoke(installedCli, ["task", "next", "--root", target, "--json"], root);
    assert.equal(rolledBack.status, 0, rolledBack.stderr);
    assert.deepEqual(JSON.parse(rolledBack.stdout).frontier, ["rollback-ready"], "old verified runtime still reads the unrevised Git-ref task state");
    assert.equal(execFileSync("git", ["-C", target, "rev-parse", "refs/krn/queue-active"], { encoding: "utf8" }).trim(), archive.refs[1].oid);

    const restored = path.join(root, "restored-clone");
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", target, restored]);
    assert.notEqual(spawnSync("git", ["-C", restored, "rev-parse", "--verify", "refs/krn/queue"], { encoding: "utf8" }).status, 0);
    const restore = invoke(installedCli, ["task", "store", "restore", "--root", restored, "--file", archivePath, "--json"], root);
    assert.equal(restore.status, 0, `${restore.stdout}${restore.stderr}`);
    assert.equal(JSON.parse(restore.stdout).restored, true);
    assert.deepEqual(postCutoverArchive.refs.map((ref) =>
      execFileSync("git", ["-C", restored, "rev-parse", ref.name], { encoding: "utf8" }).trim()),
      postCutoverArchive.refs.map((ref) => ref.oid), "rollback restores the complete selected queue without rewriting its refs");
    const restoredView = invoke(installedCli, ["task", "show", "--root", restored, "--id", "cutover-work", "--json"], root);
    assert.equal(restoredView.status, 0, restoredView.stderr);
    assert.deepEqual(JSON.parse(restoredView.stdout).task, JSON.parse(shown.stdout).task,
      "restored IDs, comments and full history match the post-cutover archive");
    assert.equal(JSON.parse(restoredView.stdout).Status, "done");
    const restoredNext = invoke(installedCli, ["task", "next", "--root", restored, "--json"], root);
    assert.equal(restoredNext.status, 0, restoredNext.stderr);
    assert.deepEqual(JSON.parse(restoredNext.stdout).frontier, ["rollback-ready"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
