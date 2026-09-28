import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The public CLI and the Git-ref queue are both present at the pinned base.
// Keep this observer loadable there; missing implementation is an assertion RED.
const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const command = (root, ...args) => spawnSync(process.execPath, [CLI, "ticket", ...args], {
  cwd: root, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined },
});

async function fixture(run, { trailerId = "legacy-proof", contract = "test/check.test.mjs:red->green", outsideScope = false, baseAlreadyGreen = false, untrackedGreenOnly = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-imported-proof-close-"));
  try {
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "operator@krn.local");
    git(root, "config", "user.name", "KRN fixture");
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "api.mjs"), `export const value = ${baseAlreadyGreen ? 1 : 0};\n`);
    writeFileSync(join(root, "test", "check.test.mjs"), [
      'import assert from "node:assert/strict";',
      ...(untrackedGreenOnly ? ['import { existsSync } from "node:fs";'] : []),
      'import { value } from "../api.mjs";',
      "assert.equal(value, 1);",
      ...(untrackedGreenOnly ? ['assert.equal(existsSync(new URL("../helper.txt", import.meta.url)), true);'] : []),
    ].join("\n"));
    writeFileSync(join(root, ".krn", "tickets", "legacy.md"), [
      "<krn-ticket>", "Id: legacy-proof", "Title: Qualify one imported proof task",
      "Status: ready", "Type: task", "Repository-base: main",
      "Scope: api.mjs", "Deciding check: node --test test/check.test.mjs",
      "Contract: test/check.test.mjs:red->green",
      "Acceptance: changed value passes a previously red test",
      "Blocked by: none", "</krn-ticket>", "", "One imported task.", "",
    ].join("\n"));
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "test: preserve imported task before work");
    const base = git(root, "rev-parse", "HEAD");

    const { prepareLegacyQueueImport } = await import("../../scripts/lib/task/task-import.mjs");
    const { openTaskStore } = await import("../../scripts/lib/task/task-store.mjs");
    const { activateTaskQueueFixture } = await import("./task-queue-fixture.mjs");
    const store = openTaskStore(root);
    const prepared = await prepareLegacyQueueImport(root);
    assert.deepEqual(prepared.report.errors, []);
    await store.importSnapshot(prepared);
    activateTaskQueueFixture(root);
    const claim = await store.claim("legacy-proof", { worker: "integrator", session: "proof-fixture" });
    assert.equal((await store.show("legacy-proof")).legacyCloseProofRequired, true);
    assert.equal((await store.show("legacy-proof")).lane, false);

    git(root, "switch", "-q", "-c", "feature");
    writeFileSync(join(root, "api.mjs"), baseAlreadyGreen ? "export const value = 1; // edited\n" : "export const value = 1;\n");
    if (outsideScope) writeFileSync(join(root, "out-of-scope.txt"), "not declared by task\n");
    git(root, "add", outsideScope ? "." : "api.mjs");
    git(root, "commit", "-q", "-m", "fix: make the old test pass", "-m", `Ticket: ${trailerId}`, "-m", `Change-contract: ${contract}`);
    const author = git(root, "rev-parse", "HEAD");
    git(root, "switch", "-q", "main");
    git(root, "merge", "-q", "--no-ff", "--no-edit", "feature");
    const integrated = git(root, "rev-parse", "HEAD");
    if (untrackedGreenOnly) writeFileSync(join(root, "helper.txt"), "untracked check dependency\n");
    await run({ root, store, claim, base, author, integrated });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function closeWithProof({ root, claim, base, author, integrated }, changes = {}) {
  return command(root, "close", "--root", root, "--id", "legacy-proof",
    "--actor", "integrator", "--expected-epoch", String(changes.epoch ?? claim.epoch),
    "--reason", "candidate checked and merged", "--base", base,
    "--head", author, "--integrated", integrated, "--json");
}

test("prose alone cannot close an imported proof-gated task", async () => {
  await fixture(async ({ root, store, claim }) => {
    const queueBefore = git(root, "rev-parse", "refs/krn/queue");
    const result = command(root, "close", "--root", root, "--id", "legacy-proof",
      "--actor", "integrator", "--expected-epoch", String(claim.epoch),
      "--reason", "I declare the change checked", "--json");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /proof-gated close requires operation readback/);
    assert.equal(git(root, "rev-parse", "refs/krn/queue"), queueBefore);
    assert.equal((await store.show("legacy-proof")).status, "claimed");
  });
});

test("a merged imported non-lane proof task can close only after executed pinned readback", async () => {
  await fixture(async ({ root, store, claim, base, author, integrated }) => {
    const queueBefore = git(root, "rev-parse", "refs/krn/queue");
    const mainBefore = git(root, "rev-parse", "refs/heads/main");
    const result = closeWithProof({ root, claim, base, author, integrated });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).status, "done");
    assert.equal((await store.show("legacy-proof")).status, "done");
    assert.notEqual(git(root, "rev-parse", "refs/krn/queue"), queueBefore);
    assert.equal(git(root, "rev-parse", "refs/heads/main"), mainBefore, "retrospective close must not reapply code");
    const checked = command(root, "check", "--root", root, "--json");
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    const report = JSON.parse(checked.stdout);
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
    assert.equal(report.warnings.some((entry) => entry.rule === "evidence-anchor-missing" || entry.rule === "done-without-commit"), false);
  });
});

test("the task store itself refuses a forged proof whose base check was green", async () => {
  await fixture(async ({ root, store, claim, base, author, integrated }) => {
    const queueBefore = git(root, "rev-parse", "refs/krn/queue");
    await assert.rejects(store.close("legacy-proof", {
      actor: "integrator", reason: "forged success", epoch: claim.epoch,
      proof: { kind: "imported-checked", base, head: author, integrated },
    }), /before-state\/contract was not executed/);
    assert.equal(git(root, "rev-parse", "refs/krn/queue"), queueBefore);
    assert.equal((await store.show("legacy-proof")).status, "claimed");
  }, { baseAlreadyGreen: true });
});

for (const [reason, setup, expected] of [
  ["forged Ticket trailer", { trailerId: "other-task" }, /missing exact Ticket trailer/],
  ["wrong Contract trailer", { contract: "test/other.test.mjs:red->green" }, /contract-mismatch/],
  ["undeclared changed file", { outsideScope: true }, /scope-undeclared/],
  ["already-green base", { baseAlreadyGreen: true }, /before-state\/contract was not executed/],
]) {
  test(`retrospective close refuses ${reason} without mutating the queue`, async () => {
    await fixture(async (context) => {
      const queueBefore = git(context.root, "rev-parse", "refs/krn/queue");
      const mainBefore = git(context.root, "rev-parse", "refs/heads/main");
      const result = closeWithProof(context);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
      assert.equal(git(context.root, "rev-parse", "refs/krn/queue"), queueBefore);
      assert.equal(git(context.root, "rev-parse", "refs/heads/main"), mainBefore);
      assert.equal((await context.store.show("legacy-proof")).status, "claimed");
    }, setup);
  });
}

test("an untracked input cannot make a red integrated commit look green", async () => {
  await fixture(async (context) => {
    const queueBefore = git(context.root, "rev-parse", "refs/krn/queue");
    const result = closeWithProof(context);
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /deciding check failed on integrated head|before-state\/contract was not executed/);
    assert.equal(git(context.root, "rev-parse", "refs/krn/queue"), queueBefore);
    assert.equal((await context.store.show("legacy-proof")).status, "claimed");
  }, { untrackedGreenOnly: true });
});

test("retrospective close refuses a moved target branch and an old claim epoch", async () => {
  await fixture(async (context) => {
    const queueBefore = git(context.root, "rev-parse", "refs/krn/queue");
    const stale = closeWithProof(context, { epoch: context.claim.epoch + 1 });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale claim generation/);
    assert.equal(git(context.root, "rev-parse", "refs/krn/queue"), queueBefore);
    git(context.root, "commit", "-q", "--allow-empty", "-m", "other integrated work moved main");
    const moved = closeWithProof(context);
    assert.notEqual(moved.status, 0);
    assert.match(moved.stderr, /integrated head is not the current branch/);
    assert.equal(git(context.root, "rev-parse", "refs/krn/queue"), queueBefore);
    assert.equal((await context.store.show("legacy-proof")).status, "claimed");
  });
});
