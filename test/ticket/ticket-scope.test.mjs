import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  Id: "sh-2",
  Title: "Scope envelope",
  Status: "ready",
  Type: "task",
  "Repository-base": "main",
  Scope: "src-a.mjs",
  "Deciding check": "node --test test/ticket/ticket-scope.test.mjs",
  Contract: "test/ticket/ticket-scope.test.mjs:red->green",
  Acceptance: "scope is enforced",
  "Blocked by": "none",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);

function makeRepo(scope, change, { id = "sh-2" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-scope-"));
  git(dir, ["init", "-q"]);
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, ".scratch", "sh-2.md"), ticket({ ...baseFields, Id: id, Scope: scope }));
  writeFileSync(join(dir, "src-a.mjs"), "export const a = 1;\n");
  git(dir, ["add", "-A"]);
  commit(dir, "seed");
  const base = git(dir, ["rev-parse", "HEAD"]).trim();
  change(dir);
  git(dir, ["add", "-A"]);
  commit(dir, "work");
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  return { dir, base, head };
}

const withRepo = (scope, change, body) => {
  const repo = makeRepo(scope, change);
  try {
    body(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
};

test("checkTickets reports changed files outside the ticket Scope", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("scripts/lib/ticket/ticket.mjs, src-a.mjs", (dir) => {
    writeFileSync(join(dir, "src-a.mjs"), "export const a = 2;\n");
    mkdirSync(join(dir, "skills"), { recursive: true });
    writeFileSync(join(dir, "skills", "manifest.json"), "{}\n");
  }, ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-2", base, head });
    const undeclared = report.errors.filter((entry) => entry.rule === "scope-undeclared");
    assert.deepEqual(undeclared.map((entry) => entry.message), ["changed file outside Scope: skills/manifest.json"], JSON.stringify(report.errors));
  });
});

test("checkTickets passes when every changed file matches Scope, including globs", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("src-a.mjs, docs/*.md", (dir) => {
    writeFileSync(join(dir, "src-a.mjs"), "export const a = 2;\n");
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "guide.md"), "# guide\n");
  }, ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, id: "sh-2", base, head });
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  });
});

test("checkTickets without --id and --base ignores Scope and behaves as before", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo("src-a.mjs", (dir) => {
    mkdirSync(join(dir, "skills"), { recursive: true });
    writeFileSync(join(dir, "skills", "manifest.json"), "{}\n");
  }, ({ dir, base, head }) => {
    const report = ticketLib.checkTickets({ root: dir, base, head });
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  });
});

test("the CLI fails with rule scope-undeclared when a changed file is outside Scope", () => {
  withRepo("src-a.mjs", (dir) => {
    mkdirSync(join(dir, "skills"), { recursive: true });
    writeFileSync(join(dir, "skills", "manifest.json"), "{}\n");
  }, ({ dir, base, head }) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "check", "--root", dir, "--id", "sh-2", "--base", base, "--head", head], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /scope-undeclared/);
    assert.match(result.stderr, /skills\/manifest\.json/);
  });
});

test("the CLI passes when every changed file matches Scope", () => {
  withRepo("src-a.mjs, docs/*.md", (dir) => {
    writeFileSync(join(dir, "src-a.mjs"), "export const a = 2;\n");
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "guide.md"), "# guide\n");
  }, ({ dir, base, head }) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "check", "--root", dir, "--id", "sh-2", "--base", base, "--head", head], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stderr, /scope-undeclared/);
  });
});
