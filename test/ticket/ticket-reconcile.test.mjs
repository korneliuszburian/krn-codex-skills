import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = join(root, "scripts", "lib", "ticket", "ticket.mjs");
const cli = join(root, "scripts", "krn-codex.mjs");

async function loadTicket() {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch {
    return null;
  }
}

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const baseFields = {
  Id: "sh-35",
  Title: "Reconcile the merge-then-close crash window",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-reconcile.test.mjs",
  Contract: "test/ticket/ticket-reconcile.test.mjs:red->green",
  Acceptance: "reconcile closes a claimed ticket whose recorded branch merged",
  "Blocked by": "none",
  Claim: "worker=w-1; session=s-1; at=2020-01-01T00:00:00.000Z; epoch=1; renew=2020-01-01T00:00:00.000Z; duration=1",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
const rev = (dir, ref) => git(dir, ["rev-parse", ref]).trim();
const isAncestor = (dir, sha, ref = "HEAD") => spawnSync("git", ["-C", dir, "merge-base", "--is-ancestor", sha, ref], { encoding: "utf8" }).status === 0;
const patchId = (dir, args) => {
  const diff = execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const out = execFileSync("git", ["-C", dir, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim();
  return out.split(/\s+/)[0];
};

const statusOf = (file) => readFileSync(file, "utf8").match(/^Status: (.*)$/m)?.[1] ?? "";

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-reconcile-"));
  git(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
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

// The lane commit records the ticket, exactly as the AFK worker's commit must.
const laneCommit = (dir, id = "sh-35") => {
  git(dir, ["checkout", "-q", "-b", "ticket/lane"]);
  writeFileSync(join(dir, "work.txt"), "lane work\n");
  git(dir, ["add", "work.txt"]);
  commit(dir, `feat: lane work\n\nTicket: ${id}`);
  return rev(dir, "HEAD");
};

const mergeLane = (dir) => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "merge", "--no-ff", "ticket/lane", "-m", "merge: integrate ticket/lane"]);
  return rev(dir, "HEAD");
};

const squashLane = (dir) => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["merge", "--squash", "ticket/lane"]);
  commit(dir, "feat: integrate ticket/lane\n\nTicket: sh-35");
  return rev(dir, "HEAD");
};

const writeTicket = (dir, overrides = {}, name = "sh-35.md") => {
  const file = join(dir, ".krn/tickets", name);
  writeFileSync(file, ticket({ ...baseFields, ...overrides }));
  return file;
};

test("reconcileTickets closes a claimed ticket whose recorded branch is an ancestor of headRef", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const base = rev(dir, "main");
    const lane = laneCommit(dir);
    const patch = patchId(dir, ["diff", `${base}..ticket/lane`]);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}; patch=${patch}` });
    mergeLane(dir);

    const observed = ticketLib.checkTickets({ root: dir, dirs: [".krn/tickets"], reconcile: false });
    assert.deepEqual(observed.reconciled, [], "a host observation must not reconcile the ticket");
    assert.equal(statusOf(file), "claimed", "the observer must leave the ticket bytes alone");

    const closed = ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" });
    assert.deepEqual(closed, ["sh-35"]);
    assert.equal(statusOf(file), "done");
    assert.match(readFileSync(file, "utf8"), new RegExp(`^Evidence: reconciled; integrated=${lane}; patch=[0-9a-f]{40}$`, "m"));
    assert.match(readFileSync(file, "utf8"), /^Resolution: merged into HEAD \(reconciled \d{4}-/m);
  });
});

test("reconcileTickets leaves a second run a no-op", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }), ["sh-35"]);
    const closed = readFileSync(file, "utf8");
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }), []);
    assert.equal(readFileSync(file, "utf8"), closed, "the second run must not rewrite a closed ticket");
  });
});

test("reconcileTickets closes a squashed integration by patch id when the sha is not an ancestor", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const base = rev(dir, "main");
    const lane = laneCommit(dir);
    const patch = patchId(dir, ["diff", `${base}..ticket/lane`]);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}; patch=${patch}` });
    squashLane(dir);
    assert.equal(isAncestor(dir, lane), false, "a squash must discard the worker commit");

    const closed = ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" });
    assert.deepEqual(closed, ["sh-35"]);
    assert.equal(statusOf(file), "done");
  });
});

test("reconcileTickets refuses a recorded sha that does not match the branch tip", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${"0".repeat(40)}; patch=${"f".repeat(40)}` });
    mergeLane(dir);
    assert.throws(
      () => ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }),
      /reconcile-sha-mismatch/,
    );
    assert.equal(statusOf(file), "claimed", "a refused reconcile must not close the ticket");
    assert.notEqual(lane, "0".repeat(40));
  });
});

test("reconcileTickets never touches blocked, abandoned, deferred, or terminal tickets", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const integration = `branch=ticket/lane; sha=${lane}`;
    const files = {
      blocked: writeTicket(dir, { Id: "sh-b", Status: "blocked", Gate: "human:review", Integration: integration }, "sh-b.md"),
      abandoned: writeTicket(dir, { Id: "sh-a", Status: "abandoned", Integration: integration }, "sh-a.md"),
      deferred: writeTicket(dir, { Id: "sh-d", Status: "deferred", Integration: integration }, "sh-d.md"),
      done: writeTicket(dir, { Id: "sh-t", Status: "done", Integration: integration }, "sh-t.md"),
    };
    mergeLane(dir);

    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }), []);
    for (const [name, file] of Object.entries(files)) {
      assert.equal(statusOf(file), name === "done" ? "done" : name, `${name} must stay untouched`);
    }
  });
});

test("reconcileTickets ignores a claimed ticket with no recorded integration", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    laneCommit(dir);
    const file = writeTicket(dir);
    mergeLane(dir);
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }), []);
    assert.equal(statusOf(file), "claimed");
  });
});

test("reconcileTickets defers to an unexpired lease so a live worker keeps its close", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const renew = new Date(Date.now() + 3600 * 1000).toISOString();
    const file = writeTicket(dir, {
      Integration: `branch=ticket/lane; sha=${lane}`,
      Claim: `worker=w-2; session=s-2; at=${renew}; epoch=2; renew=${renew}; duration=3600`,
    });
    mergeLane(dir);
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"], headRef: "HEAD" }), []);
    assert.equal(statusOf(file), "claimed");
  });
});

test("checkTickets reconciles before the frontier so ticket next self-heals", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    const report = ticketLib.checkTickets({ root: dir, dirs: [".krn/tickets"], reconcile: true });
    assert.deepEqual(report.reconciled, ["sh-35"]);
    assert.equal(statusOf(file), "done");
    assert.deepEqual(report.frontier, []);
  });
});

// The sh-176 observer used these identities before recovery was made explicit.
test("checkTickets observes without reconciling and explicit repair self-heals", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    const report = ticketLib.checkTickets({ root: dir, dirs: [".krn/tickets"] });
    assert.deepEqual(report.reconciled, []);
    assert.equal(statusOf(file), "claimed");
    assert.deepEqual(report.frontier, []);
    assert.deepEqual(ticketLib.reconcileTickets({ root: dir, dirs: [".krn/tickets"] }), ["sh-35"]);
    assert.equal(statusOf(file), "done");
  });
});

test("ticket next observes without reconciling and the repair command is explicit", () => {
  const dir = makeRepo();
  try {
    const lane = laneCommit(dir);
    const file = writeTicket(dir, { Integration: `branch=ticket/lane; sha=${lane}` });
    mergeLane(dir);
    const result = spawnSync(process.execPath, [cli, "ticket", "next", "--root", dir, "--path", join(dir, ".krn/tickets")], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stdout, /sh-35/);
    assert.equal(statusOf(file), "claimed");
    const reconcile = spawnSync(process.execPath, [cli, "ticket", "reconcile", "--root", dir, "--path", join(dir, ".krn/tickets"), "--json"], { encoding: "utf8" });
    assert.equal(reconcile.status, 0, `${reconcile.stdout}${reconcile.stderr}`);
    assert.deepEqual(JSON.parse(reconcile.stdout).reconciled, ["sh-35"]);
    assert.equal(statusOf(join(dir, ".krn/tickets", "sh-35.md")), "done");
    const recoveredNext = spawnSync(process.execPath, [cli, "ticket", "next", "--root", dir, "--path", join(dir, ".krn/tickets")], { encoding: "utf8" });
    assert.equal(recoveredNext.status, 0, `${recoveredNext.stdout}${recoveredNext.stderr}`);
    assert.doesNotMatch(recoveredNext.stdout, /sh-35/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
