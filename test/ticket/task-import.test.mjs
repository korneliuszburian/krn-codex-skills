import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let prepareLegacyQueueImport;
let restoreLegacyQueueArchive;
let openTaskStore;
let taskTicketView;
let ticketLaneBindings;
try {
  ({ prepareLegacyQueueImport, restoreLegacyQueueArchive } = await import("../../scripts/lib/ticket/task-import.mjs"));
} catch {
  // Keep the observer loadable before the importer exists so behavior fails as a test, not as setup.
}
try {
  ({ openTaskStore } = await import("../../scripts/lib/ticket/task-store.mjs"));
} catch {
  // Keep the observer loadable before the task store exists so behavior fails as a test, not as setup.
}
try {
  ({ taskTicketView, ticketLaneBindings } = await import("../../scripts/lib/ticket/ticket.mjs"));
} catch {
  // Keep the observer loadable before the active task view exists.
}

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-task-import-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "import@krn.local");
  git(root, "config", "user.name", "import");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed import fixture");
  return root;
}

function ticket({ id, status, blockedBy = "none", claim = "", extra = "" }) {
  return [
    "<krn-ticket>",
    `Id: ${id}`,
    `Title: ${id} task`,
    `Status: ${status}`,
    "Type: task",
    "Repository-base: 0123456789012345678901234567890123456789",
    "Scope: scripts/lib/ticket/**",
    "Deciding check: node --test test/ticket/task-product.test.mjs",
    "Contract: test/ticket/task-product.test.mjs:red->green",
    "Acceptance: preserve task state",
    `Blocked by: ${blockedBy}`,
    ...(claim ? [`Claim: ${claim}`] : []),
    ...(extra ? [extra] : []),
    "</krn-ticket>",
    "",
    "Original task description.",
    "",
  ].join("\n");
}

test("the default queue import excludes upstream scratch files and reads only the KRN ticket root", async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, ".scratch", "feature", "issues"), { recursive: true });
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    writeFileSync(join(root, ".scratch", "feature", "spec.md"), "# External scratch spec\n");
    writeFileSync(join(root, ".scratch", "feature", "issues", "01-task.md"), "# 01: External issue\n\nStatus: ready-for-agent\n");
    writeFileSync(join(root, ".krn", "tickets", "owned.md"), ticket({ id: "krn-task", status: "ready" }));

    const prepared = await prepareLegacyQueueImport(root);
    assert.deepEqual(prepared.report.errors, []);
    assert.deepEqual(prepared.report.pathIds, [{ path: ".krn/tickets/owned.md", id: "krn-task" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy import preserves path/ID pairs and exact archive bytes while reporting unmapped fields", async () => {
  const root = makeRepo();
  const restoreRoot = mkdtempSync(join(tmpdir(), "krn-task-restore-"));
  try {
    const readyPath = ".krn/tickets/team/ready.md";
    const claimedPath = ".krn/tickets/claimed.md";
    const dependencyPath = ".krn/tickets/team/dependency.md";
    const claimAt = "2000-01-01T00:00:00Z";
    const claim = `worker=worker-a; session=session-a; at=${claimAt}; epoch=2; renew=${claimAt}; duration=3600; future=retain-me`;
    const readyBytes = Buffer.from(ticket({
      id: "team/ready",
      status: "ready",
      blockedBy: "team/dependency",
      extra: "Gate: human:approval required\nExecution: agent=opencode; requested-model=gpt-6-sol; observed-model=unreported; parallel=read-only\nRecall: lesson:abc123#row-18\nCustom Field: preserve me\nAttempts: attempt-one\nAttempts: attempt-two",
    }).replaceAll("\n", "\r\n"));
    const claimedBytes = Buffer.from(ticket({
      id: "claimed",
      status: "claimed",
      claim,
      extra: "Gate: operator-maintenance\nExecution: agent=maintainer; model=opencode-go/deepseek-v4.1-flash; effort=default; parallel=none",
    }));
    const integratedSha = "1234567890123456789012345678901234567890";
    const integratedPatch = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const dependencyBytes = Buffer.from(ticket({
      id: "team/dependency",
      status: "done",
      extra: `Integration: branch=lane/team-dependency; sha=${integratedSha}; patch=${integratedPatch}`,
    }));
    mkdirSync(join(root, ".krn/tickets/team"), { recursive: true });
    mkdirSync(join(root, ".krn/tickets"), { recursive: true });
    mkdirSync(join(root, ".krn/claims"), { recursive: true });
    writeFileSync(join(root, readyPath), readyBytes);
    writeFileSync(join(root, claimedPath), claimedBytes);
    writeFileSync(join(root, dependencyPath), dependencyBytes);
    writeFileSync(join(root, ".krn/claims/claimed.lock"), JSON.stringify({
      worker: "worker-a", session: "", at: claimAt, epoch: 2, renew: claimAt, duration: 3600,
    }));

    const prepared = await prepareLegacyQueueImport(root);
    assert.deepEqual(prepared.report.errors, []);
    assert.deepEqual(prepared.report.ambiguities.map((entry) => entry.field), ["Claim.session"]);
    assert.deepEqual(prepared.report.duplicateFields.map((entry) => [entry.field, entry.count, entry.identical]), [["Attempts", 2, false]]);
    assert.deepEqual(prepared.report.pathIds, [
      { path: ".krn/tickets/claimed.md", id: "claimed" },
      { path: ".krn/tickets/team/dependency.md", id: "team/dependency" },
      { path: ".krn/tickets/team/ready.md", id: "team/ready" },
    ]);
    assert.equal(prepared.state.tasks["team/ready"].type, "task");
    assert.deepEqual(prepared.state.tasks["team/ready"].laneRecipe, {
      base: "0123456789012345678901234567890123456789",
      scope: "scripts/lib/ticket/**",
      check: "node --test test/ticket/task-product.test.mjs",
      contract: "test/ticket/task-product.test.mjs:red->green",
      acceptance: "preserve task state",
    });
    assert.deepEqual(prepared.state.tasks["team/ready"].gate, { kind: "human", detail: "approval required", legacyRaw: "human:approval required" });
    assert.deepEqual(prepared.state.tasks["team/ready"].executionHint, {
      agentHint: "opencode",
      legacyRaw: "agent=opencode; requested-model=gpt-6-sol; observed-model=unreported; parallel=read-only",
    });
    assert.deepEqual(ticketLaneBindings(new Map([[
      "Execution",
      prepared.state.tasks["team/ready"].executionHint.legacyRaw,
    ]])), [["TICKET_AGENT", "opencode"]]);
    assert.equal(prepared.state.tasks["team/ready"].lane, false, "a required Contract does not imply automated lane membership");
    assert.equal(prepared.state.tasks["team/ready"].legacyCloseProofRequired, true, "legacy close preserves its required proof");
    assert.deepEqual(prepared.state.tasks["team/dependency"].integration, {
      branch: "lane/team-dependency",
      sha: integratedSha,
      patch: integratedPatch,
      legacyRaw: `branch=lane/team-dependency; sha=${integratedSha}; patch=${integratedPatch}`,
    });
    assert.equal(prepared.state.tasks["team/dependency"].lane, true);
    assert.deepEqual(prepared.state.tasks["team/ready"].dependencies, ["team/dependency"]);
    assert.deepEqual(prepared.state.tasks["team/ready"].legacyFields, {
      Recall: "lesson:abc123#row-18",
      "Custom Field": "preserve me",
      Attempts: ["attempt-one", "attempt-two"],
    });
    assert.deepEqual(prepared.state.tasks.claimed.lease, {
      worker: "worker-a", session: "session-a", at: claimAt, epoch: 2, renew: claimAt, duration: 3600,
    });
    assert.equal(prepared.state.tasks.claimed.gate, null);
    assert.equal(prepared.state.tasks.claimed.legacyFields.Gate, "operator-maintenance");
    assert.ok(prepared.report.unmappedFields.some((entry) => entry.id === "claimed" && entry.field === "Gate"));
    assert.equal(prepared.state.tasks.claimed.executionHint, null);
    assert.equal(prepared.state.tasks.claimed.legacyFields.Execution, "agent=maintainer; model=opencode-go/deepseek-v4.1-flash; effort=default; parallel=none");
    assert.ok(prepared.report.unmappedFields.some((entry) => entry.id === "claimed" && entry.field === "Execution"));
    assert.equal(prepared.state.tasks.claimed.legacyFields.Claim, claim);
    assert.ok(prepared.report.unmappedFields.some((entry) => entry.id === "team/ready" && entry.field === "Recall"));
    assert.equal(prepared.report.unmappedFields.some((entry) => entry.id === "team/ready" && entry.field === "Execution"), false);
    assert.equal(prepared.report.unmappedFields.some((entry) => entry.field === "Integration"), false);
    assert.equal(prepared.report.unmappedFields.some((entry) => entry.id === "team/ready" && entry.field === "Gate"), false);
    const store = openTaskStore(root);
    await assert.rejects(store.importSnapshot(prepared), /unresolved claim ambiguities/);
    await assert.rejects(store.importSnapshot(prepared, { acceptClaimSessionAmbiguities: "yes" }), /acknowledgement must be boolean/);
    assert.deepEqual(await store.importSnapshot(prepared, { acceptClaimSessionAmbiguities: true }), {
      tasks: 3, version: 1, acknowledgedClaimSessionAmbiguities: 1,
    });
    assert.deepEqual((await store.read()).tasks.claimed.legacyFields.Claim, claim);
    const claimedView = taskTicketView((await store.read()).tasks.claimed);
    assert.equal(claimedView.fields.get("Claim"), claim, "the task projection leaves ambiguous Claim.session raw text visible");
    assert.equal(claimedView.taskLease.session, "session-a", "the typed current lease is available separately from the preserved raw ambiguity");
    await restoreLegacyQueueArchive(restoreRoot, prepared.archive);
    assert.deepEqual(readFileSync(join(restoreRoot, readyPath)), readyBytes);
    assert.deepEqual(readFileSync(join(restoreRoot, claimedPath)), claimedBytes);
    assert.deepEqual(readFileSync(join(restoreRoot, dependencyPath)), dependencyBytes);
    assert.equal(readFileSync(join(restoreRoot, ".krn/claims/claimed.lock"), "utf8"), JSON.stringify({
      worker: "worker-a", session: "", at: claimAt, epoch: 2, renew: claimAt, duration: 3600,
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(restoreRoot, { recursive: true, force: true });
  }
});

test("legacy archive restore rejects traversal and refuses to overwrite different bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "krn-task-restore-guard-"));
  const outside = mkdtempSync(join(tmpdir(), "krn-task-restore-outside-"));
  try {
    assert.throws(() => restoreLegacyQueueArchive(root, { version: 1, entries: [{ path: "../../outside", content: "eA==", sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" }] }), /unsafe archive path/);
    const stagedBytes = Buffer.from("staged");
    const stagedDigest = createHash("sha256").update(stagedBytes).digest("hex");
    assert.throws(() => restoreLegacyQueueArchive(root, { version: 1, entries: [
      { path: ".krn/tickets/staged.md", content: stagedBytes.toString("base64"), sha256: stagedDigest },
      { path: "../unsafe.md", content: "eA==", sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" },
    ] }), /unsafe archive path/);
    assert.equal(existsSync(join(root, ".krn/tickets/staged.md")), false, "preflight errors do not leave a partial restore");
    mkdirSync(join(root, ".krn/tickets"), { recursive: true });
    writeFileSync(join(root, ".krn/tickets/a.md"), "different");
    const original = Buffer.from("original");
    const digest = createHash("sha256").update(original).digest("hex");
    assert.throws(() => restoreLegacyQueueArchive(root, { version: 1, entries: [{ path: ".krn/tickets/a.md", content: original.toString("base64"), sha256: digest }] }), /restore target already differs/);
    symlinkSync(outside, join(root, "linked"));
    assert.throws(() => restoreLegacyQueueArchive(root, { version: 1, entries: [{ path: "linked/escape.md", content: "eA==", sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" }] }), /unsafe archive parent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("an imported ready task with an unfinished blocker is omitted from the frontier and prepared state cannot be tampered", async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, ".krn/tickets"), { recursive: true });
    writeFileSync(join(root, ".krn/tickets/blocker.md"), ticket({ id: "blocker", status: "ready" }));
    writeFileSync(join(root, ".krn/tickets/blocked.md"), ticket({ id: "blocked", status: "ready", blockedBy: "blocker" }));
    const prepared = await prepareLegacyQueueImport(root);
    const store = openTaskStore(root);
    const tamperedState = structuredClone(prepared);
    tamperedState.state.tasks.blocked.legacyFields.Type = "forged task type";
    await assert.rejects(store.importSnapshot(tamperedState), /prepared import differs from its source snapshot/);
    const corrupted = {
      ...prepared,
      archive: { ...prepared.archive, entries: prepared.archive.entries.map((entry, index) => index === 0 ? { ...entry, sha256: "0".repeat(64) } : entry) },
    };
    await assert.rejects(store.importSnapshot(corrupted), /prepared import differs from its source snapshot/);
    const tampered = structuredClone(prepared);
    tampered.state.tasks.blocked.legacyFields.Type = "forged task type";
    await assert.rejects(store.importSnapshot(tampered), /prepared import differs from its source snapshot/);
    await store.importSnapshot(prepared);
    assert.deepEqual(await store.check(), { ok: true, errors: [] });
    assert.equal((await store.show("blocker")).lane, false);
    assert.equal((await store.show("blocker")).legacyCloseProofRequired, true);
    await assert.rejects(store.close("blocker", { actor: "operator", reason: "close through legacy path" }), /proof-gated close requires operation readback/);
    assert.deepEqual((await store.ready()).map((task) => task.id), ["blocker"]);
    await assert.rejects(store.claim("blocked", { worker: "worker" }), /unresolved dependencies/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy import refuses ticket roots that are symlinks outside the repository", async () => {
  const root = makeRepo();
  const outside = mkdtempSync(join(tmpdir(), "krn-task-import-outside-"));
  try {
    mkdirSync(join(outside, ".krn", "tickets"), { recursive: true });
    mkdirSync(join(root, ".krn"), { recursive: true });
    writeFileSync(join(outside, ".krn", "tickets", "escape.md"), ticket({ id: "escape", status: "ready" }));
    symlinkSync(join(outside, ".krn", "tickets"), join(root, ".krn", "tickets"));
    assert.throws(() => prepareLegacyQueueImport(root), /ticket root path contains a symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("legacy import refuses a per-ticket claim lock symlink outside the repository", async () => {
  const root = makeRepo();
  const outside = mkdtempSync(join(tmpdir(), "krn-task-import-claim-outside-"));
  try {
    const claimAt = "2000-01-01T00:00:00Z";
    const claim = `worker=worker-a; session=session-a; at=${claimAt}; epoch=2; renew=${claimAt}; duration=3600`;
    mkdirSync(join(root, ".krn/tickets"), { recursive: true });
    mkdirSync(join(root, ".krn/claims"), { recursive: true });
    writeFileSync(join(root, ".krn/tickets/claimed.md"), ticket({ id: "claimed", status: "claimed", claim }));
    const outsideLock = join(outside, "claimed.lock");
    writeFileSync(outsideLock, JSON.stringify({ worker: "worker-a", session: "session-a", at: claimAt, epoch: 2, renew: claimAt, duration: 3600 }));
    symlinkSync(outsideLock, join(root, ".krn/claims/claimed.lock"));
    assert.throws(() => prepareLegacyQueueImport(root), /symlink entry under claim lock root/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("legacy import rejects a symlinked .krn ancestor and nested symlink directories", async () => {
  const ancestorRoot = makeRepo();
  const outside = mkdtempSync(join(tmpdir(), "krn-task-import-ancestor-outside-"));
  try {
    mkdirSync(join(outside, ".krn/tickets"), { recursive: true });
    writeFileSync(join(outside, ".krn/tickets/external.md"), ticket({ id: "external", status: "ready" }));
    symlinkSync(join(outside, ".krn"), join(ancestorRoot, ".krn"));
    assert.throws(() => prepareLegacyQueueImport(ancestorRoot), /ticket root path contains a symlink/);
  } finally {
    rmSync(ancestorRoot, { recursive: true, force: true });
  }

  const nestedRoot = makeRepo();
  try {
    mkdirSync(join(nestedRoot, ".krn/tickets"), { recursive: true });
    mkdirSync(join(outside, "nested-tickets"), { recursive: true });
    writeFileSync(join(outside, "nested-tickets/hidden.md"), ticket({ id: "hidden", status: "ready" }));
    symlinkSync(join(outside, "nested-tickets"), join(nestedRoot, ".krn/tickets/nested"));
    assert.throws(() => prepareLegacyQueueImport(nestedRoot), /symlink entry under ticket root/);
  } finally {
    rmSync(nestedRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
