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
  Id: "sh-12",
  Title: "Anchor closed-ticket evidence",
  Status: "ready",
  Type: "bug",
  "Repository-base": "main",
  Scope: "scripts/lib/ticket/ticket.mjs",
  "Deciding check": "node --test test/ticket/ticket-evidence-anchor.test.mjs",
  Contract: "test/ticket/ticket-evidence-anchor.test.mjs:red->green",
  Acceptance: "a closure binds its evidence to a content identity that survives a squash",
  "Blocked by": "none",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
const rev = (dir, ref) => git(dir, ["rev-parse", ref]).trim();
const isAncestor = (dir, sha) => spawnSync("git", ["-C", dir, "merge-base", "--is-ancestor", sha, "HEAD"], { encoding: "utf8" }).status === 0;

const patchId = (dir, args) => {
  const diff = execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const out = execFileSync("git", ["-C", dir, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim();
  return out.split(/\s+/)[0];
};

const evidenceOf = (file) => readFileSync(file, "utf8").match(/^Evidence: (.*)$/m)?.[1] ?? "";
const anchorOf = (file) => {
  const evidence = evidenceOf(file);
  return {
    integrated: evidence.match(/integrated=([0-9a-f]{40})/)?.[1] ?? "",
    patch: evidence.match(/patch=([0-9a-f]{40})/)?.[1] ?? "",
  };
};

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-anchor-"));
  git(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, ".scratch", "sh-12.md"), ticket(baseFields));
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

const laneCommit = (dir) => {
  git(dir, ["checkout", "-q", "-b", "ticket/lane"]);
  writeFileSync(join(dir, "work.txt"), "work\n");
  git(dir, ["add", "work.txt"]);
  commit(dir, "lane work");
  return rev(dir, "HEAD");
};

const squashIntoMain = (dir) => {
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["merge", "--squash", "ticket/lane"]);
  commit(dir, "squash lane");
  return rev(dir, "HEAD");
};

test("close records the integrated commit and the stable patch id over the ticket range", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".scratch", "sh-12.md");
    const mainBefore = rev(dir, "main");
    const laneSha = laneCommit(dir);
    ticketLib.claimTicket({ file, root: dir, id: "sh-12", worker: "stub" });
    ticketLib.closeTicket({ file, root: dir, evidence: "node --test green", resolution: "merged locally" });
    const anchor = anchorOf(file);
    assert.equal(anchor.integrated, laneSha, "the closure must pin the committed sha");
    assert.equal(anchor.patch, patchId(dir, ["diff", `${mainBefore}..${laneSha}`]), "the patch id must match git patch-id --stable over the branch range");
    assert.match(evidenceOf(file), /^node --test green; integrated=/);
  });
});

test("a squashed closure survives because its patch id is present in the range", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".scratch", "sh-12.md");
    const mainBefore = rev(dir, "main");
    const laneSha = laneCommit(dir);
    ticketLib.claimTicket({ file, root: dir, id: "sh-12", worker: "stub" });
    ticketLib.closeTicket({ file, root: dir, evidence: "gate green", resolution: "merged locally" });
    const anchor = anchorOf(file);
    squashIntoMain(dir);
    assert.equal(isAncestor(dir, laneSha), false, "a squash must remove the worker commit");
    const report = ticketLib.checkTickets({ root: dir, base: mainBefore, head: "HEAD" });
    assert.deepEqual(report.errors.filter((entry) => entry.rule === "evidence-anchor-missing"), [], JSON.stringify(report.errors));
    assert.ok(anchor.patch, "the closure must carry a patch id to survive");
  });
});

test("check reports evidence-anchor-missing when neither the sha nor the patch id survives", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".scratch", "sh-12.md");
    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: `gate green; integrated=${"0".repeat(40)}; patch=${"f".repeat(40)}` }));
    const report = ticketLib.checkTickets({ root: dir, base: rev(dir, "main"), head: "HEAD" });
    const found = report.errors.filter((entry) => entry.rule === "evidence-anchor-missing");
    assert.equal(found.length, 1, JSON.stringify(report.errors));
    assert.equal(found[0].path, join(".scratch", "sh-12.md"));
    assert.match(found[0].message, /not an ancestor/);
  });
});

test("check keeps a closure whose integrated commit is still an ancestor", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo((dir) => {
    const file = join(dir, ".scratch", "sh-12.md");
    const seed = rev(dir, "main");
    writeFileSync(file, ticket({ ...baseFields, Status: "done", Evidence: `gate green; integrated=${seed}; patch=${"f".repeat(40)}` }));
    const report = ticketLib.checkTickets({ root: dir, base: seed, head: "HEAD" });
    assert.deepEqual(report.errors.filter((entry) => entry.rule === "evidence-anchor-missing"), [], JSON.stringify(report.errors));
  });
});

test("the CLI closes with an anchor and flags the vanished one", () => {
  const dir = makeRepo();
  try {
    const tickets = join(dir, ".scratch");
    const file = join(tickets, "sh-12.md");
    const mainBefore = rev(dir, "main");
    const laneSha = laneCommit(dir);
    const run = (...args) => spawnSync(process.execPath, [cli, "ticket", ...args], { encoding: "utf8" });

    const close = run("close", "--root", dir, "--path", tickets, "--id", "sh-12", "--evidence", "gate green", "--resolution", "merged", "--json");
    assert.equal(close.status, 0, `${close.stdout}${close.stderr}`);
    assert.equal(JSON.parse(close.stdout).anchor.sha, laneSha);
    assert.match(evidenceOf(file), /integrated=[0-9a-f]{40}; patch=[0-9a-f]{40}$/);

    squashIntoMain(dir);
    const green = run("check", "--root", dir, "--base", mainBefore, "--head", "HEAD");
    assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);

    writeFileSync(file, readFileSync(file, "utf8").replace(/integrated=[0-9a-f]{40}/, `integrated=${"0".repeat(40)}`).replace(/patch=[0-9a-f]{40}/, `patch=${"f".repeat(40)}`));
    const red = run("check", "--root", dir, "--base", mainBefore, "--head", "HEAD");
    assert.notEqual(red.status, 0, `${red.stdout}${red.stderr}`);
    assert.match(red.stderr, /evidence-anchor-missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
