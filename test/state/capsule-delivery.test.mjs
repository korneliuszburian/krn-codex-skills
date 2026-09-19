import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runGit } from "../../scripts/lib/kernel/git.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = join(root, "scripts", "hooks", "krn_memory.py");

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "krn-capsule-delivery-"));
  runGit(dir, ["init", "-q"]);
  runGit(dir, ["config", "user.email", "lab@krn.local"]);
  runGit(dir, ["config", "user.name", "lab"]);
  runGit(dir, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  return dir;
}

function capsuleText({ outcome = "ACTIVE", action = "resume the delivery slice" } = {}) {
  return [
    "Outcome and observable acceptance: node --test test/state/capsule-delivery.test.mjs",
    "Current workflow owner and sole writer: $delivery-loop",
    `Outcome state: ${outcome}`,
    "Publication state: LOCAL_ONLY",
    "Repository base, HEAD or working-tree fingerprint, and dirty-state scope: fingerprint=working-tree",
    "Native Goal identity/state and configured tracker item/state: none",
    "Restart state: ABSENT",
    "Outstanding workflow-run cleanup: none",
    "Authority: writes=none; tracker/issue=none; commit=none; push=none; PR=none; merge=none; deployment/install=none",
    "Evidence observed: none",
    "Explicit non-proofs: none",
    "Review fixed point and Standards / Spec disposition: none",
    `Next bounded owner and action: ${action}`,
    "",
  ].join("\n");
}

function writeCapsule(dir, id, text = capsuleText()) {
  const capsule = join(dir, ".krn", "runs", "delivery-loop", id);
  mkdirSync(capsule, { recursive: true });
  writeFileSync(join(capsule, "state.md"), text);
}

function runHook(cwd, event = "SessionStart") {
  let result;
  try {
    result = spawnSync("python3", ["-B", hook], {
      input: JSON.stringify({ hook_event_name: event, cwd }),
      encoding: "utf8",
    });
  } catch {
    return { status: -1, context: null };
  }
  if (result.status !== 0) return { status: result.status ?? -1, context: null };
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  if (!stdout) return { status: 0, context: null };
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { status: 0, context: null };
  }
  return { status: 0, context: parsed?.hookSpecificOutput?.additionalContext ?? null };
}

function capsuleLines(text) {
  return typeof text === "string" ? (text.match(/Capsule /g) ?? []).length : 0;
}

async function withRepo(body) {
  const dir = makeRepo();
  try {
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a subdirectory session receives the same single capsule brief as a root session", async () => {
  await withRepo(async (dir) => {
    writeCapsule(dir, "out-1", capsuleText({ action: "continue through the worktree root" }));
    const nested = join(dir, "packages", "app", "src");
    mkdirSync(nested, { recursive: true });

    const fromRoot = runHook(dir);
    const fromNested = runHook(nested);
    assert.ok(fromRoot.context, JSON.stringify(fromRoot));
    assert.ok(fromNested.context, "the subdirectory session must still receive the capsule brief");
    assert.equal(fromNested.context, fromRoot.context, "both sessions observe the same brief");

    const spine = await import("../../scripts/lib/state/spine-runs.mjs");
    const plugin = await import("../../config/opencode/plugins/krn.js");
    assert.deepEqual(spine.capsuleIdsDetailed(dir).ids, ["out-1"]);

    const rootBrief = plugin.capsuleBrief(dir);
    const nestedBrief = plugin.capsuleBrief(nested);
    assert.ok(rootBrief, "the plugin briefs from the repository root");
    assert.ok(nestedBrief, "the plugin briefs from a subdirectory");
    assert.equal(nestedBrief, rootBrief, "the plugin brief is identical from a subdirectory");
  });
});

test("a symlinked capsule run yields exactly one id and one brief", async () => {
  await withRepo(async (dir) => {
    writeCapsule(dir, "out-1", capsuleText({ action: "continue through the alias" }));
    const base = join(dir, ".krn", "runs", "delivery-loop");
    symlinkSync("out-1", join(base, "alias"));

    const spine = await import("../../scripts/lib/state/spine-runs.mjs");
    assert.deepEqual(spine.capsuleIdsDetailed(dir).ids, ["out-1"], "the real directory wins the realpath dedupe");

    const plugin = await import("../../config/opencode/plugins/krn.js");
    const pluginBrief = plugin.capsuleBrief(dir);
    assert.equal(capsuleLines(pluginBrief), 1, pluginBrief ?? "no plugin brief");

    const hookResult = runHook(dir);
    assert.ok(hookResult.context, JSON.stringify(hookResult));
    assert.equal(capsuleLines(hookResult.context), 1, hookResult.context);
  });
});

test("a state.md resolving outside the repository is refused by all three surfaces", async () => {
  const outside = mkdtempSync(join(tmpdir(), "krn-capsule-outside-"));
  try {
    writeFileSync(join(outside, "state.md"), capsuleText({ action: "escape the repository" }));
    await withRepo(async (dir) => {
      const capsule = join(dir, ".krn", "runs", "delivery-loop", "out-1");
      mkdirSync(capsule, { recursive: true });
      symlinkSync(join(outside, "state.md"), join(capsule, "state.md"));

      const { inspectSpineState } = await import("../../scripts/lib/state/state-check.mjs");
      const spine = await import("../../scripts/lib/state/spine-runs.mjs");

      const report = inspectSpineState({ repo: dir });
      assert.ok(
        report.errors.some((error) => error.rule === "capsule-outside-repo"),
        JSON.stringify(report.errors),
      );
      assert.equal(report.capsules.length, 0, JSON.stringify(report.capsules));
      assert.deepEqual(spine.capsuleIdsDetailed(dir).ids, [], JSON.stringify(spine.capsuleIdsDetailed(dir)));

      const plugin = await import("../../config/opencode/plugins/krn.js");
      assert.equal(plugin.capsuleBrief(dir), null, "the plugin must not follow an outside state.md");

      const hookResult = runHook(dir);
      assert.equal(hookResult.context, null, "the hook must not follow an outside state.md");
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a run directory without state.md reports capsule-state-missing, not a silent clean", async () => {
  await withRepo(async (dir) => {
    mkdirSync(join(dir, ".krn", "runs", "delivery-loop", "ghost"), { recursive: true });

    const { inspectSpineState } = await import("../../scripts/lib/state/state-check.mjs");
    const spine = await import("../../scripts/lib/state/spine-runs.mjs");

    const report = inspectSpineState({ repo: dir });
    assert.ok(
      report.errors.some((error) => error.rule === "capsule-state-missing"),
      JSON.stringify(report.errors),
    );
    assert.ok(
      spine.capsuleIdsDetailed(dir).errors.some((error) => error.rule === "capsule-state-missing"),
      JSON.stringify(spine.capsuleIdsDetailed(dir).errors),
    );
  });
});
