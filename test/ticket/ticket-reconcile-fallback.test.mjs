import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadTicket() {
  try {
    return await import("../../scripts/lib/ticket/ticket.mjs");
  } catch {
    return null;
  }
}

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const baseFields = {
  Id: "sh-82",
  Title: "Reconcile must not trust an unverifiable recorded sha",
  Status: "claimed",
  Type: "bug",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-reconcile-fallback.test.mjs",
  Contract: "test/ticket/ticket-reconcile-fallback.test.mjs:red->green",
  Acceptance: "an unresolvable integration branch refuses an unverifiable recorded sha",
  "Blocked by": "none",
  Claim: "worker=w-1; session=s-1; at=2020-01-01T00:00:00.000Z; epoch=1; renew=2020-01-01T00:00:00.000Z; duration=1",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) =>
  git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
const rev = (dir, ref) => git(dir, ["rev-parse", ref]).trim();
const isAncestor = (dir, sha, ref = "HEAD") =>
  spawnSync("git", ["-C", dir, "merge-base", "--is-ancestor", sha, ref], { encoding: "utf8" }).status === 0;
const patchId = (dir, args) => {
  const diff = execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const out = execFileSync("git", ["-C", dir, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim();
  return out.split(/\s+/)[0];
};

const statusOf = (file) => readFileSync(file, "utf8").match(/^Status: (.*)$/m)?.[1] ?? "";

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-reconcile-fallback-"));
  git(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "seed.txt"]);
  commit(dir, "seed");
  return dir;
}

const withRepo = (body) => {
  const dir = makeRepo();
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const laneCommit = (dir, branch = "ticket/lane", id = "sh-82") => {
  git(dir, ["checkout", "-q", "-b", branch]);
  writeFileSync(join(dir, "work.txt"), `lane work for ${branch}\n`);
  git(dir, ["add", "work.txt"]);
  commit(dir, `feat: lane work\n\nTicket: ${id}`);
  return rev(dir, "HEAD");
};

// Drop the ref but keep the object: the integration record still names the
// branch, and its recorded sha is all that can identify the work.
const removeBranch = (dir, branch = "ticket/lane") => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["branch", "-D", branch]);
};

const mergeLane = (dir, branch = "ticket/lane") => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "merge", "--no-ff", branch, "-m", `merge: integrate ${branch}`]);
  return rev(dir, "HEAD");
};

const squashLane = (dir, branch = "ticket/lane") => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["merge", "--squash", branch]);
  commit(dir, "feat: integrate lane\n\nTicket: sh-82");
  return rev(dir, "HEAD");
};

const writeTicket = (dir, overrides = {}, name = "sh-82.md") => {
  const file = join(dir, ".scratch", name);
  writeFileSync(file, ticket({ ...baseFields, ...overrides }));
  return file;
};

test("reconcileTickets refuses an unresolvable branch whose recorded sha is outside the head range", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    removeBranch(dir);
    assert.equal(isAncestor(dir, lane), false, "the discarded lane commit is not an ancestor of main");

    assert.throws(
      () => ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" }),
      /reconcile-sha-unverifiable/,
    );
    assert.equal(statusOf(file), "claimed", "a refused reconcile must leave the ticket untouched");
  });
});

test("reconcileTickets closes an unresolvable branch whose recorded sha is an ancestor of headRef", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    removeBranch(dir);
    assert.equal(isAncestor(dir, lane), true, "the merged lane commit is an ancestor of main");

    const closed = ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" });
    assert.deepEqual(closed, ["sh-82"]);
    assert.equal(statusOf(file), "done");
  });
});

test("reconcileTickets closes an unresolvable branch whose patch id is present in the bounded range", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const base = rev(dir, "main");
    const lane = laneCommit(dir);
    const patch = patchId(dir, ["diff", `${base}..ticket/lane`]);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}; patch=${patch}` });
    squashLane(dir);
    removeBranch(dir);
    assert.equal(isAncestor(dir, lane), false, "a squash discards the worker commit");

    const closed = ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" });
    assert.deepEqual(closed, ["sh-82"]);
    assert.equal(statusOf(file), "done");
  });
});

test("reconcileTickets leaves a second run over an unresolvable branch a no-op", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    removeBranch(dir);
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" }), ["sh-82"]);
    const closed = readFileSync(file, "utf8");
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" }), []);
    assert.equal(readFileSync(file, "utf8"), closed, "the second run must not rewrite a closed ticket");
  });
});

test("reconcileTickets never touches blocked or terminal tickets with an unresolvable branch", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const integration = `branch=ticket/lane; sha=${lane}`;
    const files = {
      blocked: writeTicket(dir, { Id: "sh-b", Status: "blocked", Gate: "human:review", Integration: integration }, "sh-b.md"),
      done: writeTicket(dir, { Id: "sh-t", Status: "done", Integration: integration }, "sh-t.md"),
    };
    mergeLane(dir);
    removeBranch(dir);

    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".scratch"], headRef: "HEAD" }), []);
    for (const [name, file] of Object.entries(files)) {
      assert.equal(statusOf(file), name, `${name} must stay untouched`);
    }
  });
});
