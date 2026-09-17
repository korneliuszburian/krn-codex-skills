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

const CONTRACT = "test/ticket/ticket-close-verify.test.mjs:red->green";

const baseFields = {
  Id: "sh-16",
  Title: "Verify scope and contract before close",
  Status: "claimed",
  Type: "task",
  "Repository-base": "main",
  Scope: "src-a.mjs",
  "Deciding check": "node --test test/ticket/ticket-close-verify.test.mjs",
  Contract: CONTRACT,
  Acceptance: "close refuses out-of-scope or contract-mismatched evidence",
  "Blocked by": "none",
};

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const commit = (dir, message) => git(dir, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
const rev = (dir, ref) => git(dir, ["rev-parse", ref]).trim();

const matchingTrailer = `Ticket: sh-16\nChange-contract: ${CONTRACT}`;

function makeRepo({ scope = baseFields.Scope, change, trailer = matchingTrailer } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-close-"));
  git(dir, ["init", "-q"]);
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, ".scratch", "sh-16.md"), ticket({ ...baseFields, Scope: scope }));
  writeFileSync(join(dir, "src-a.mjs"), "export const a = 1;\n");
  git(dir, ["add", "-A"]);
  commit(dir, "seed");
  const base = rev(dir, "HEAD");
  change(dir);
  git(dir, ["add", "-A"]);
  commit(dir, trailer ? `work\n\n${trailer}` : "work");
  const head = rev(dir, "HEAD");
  return { dir, base, head, file: join(dir, ".scratch", "sh-16.md") };
}

const withRepo = (options, body) => {
  const repo = makeRepo(options);
  try {
    body(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
};

const inScope = (dir) => writeFileSync(join(dir, "src-a.mjs"), "export const a = 2;\n");
const outOfScope = (dir) => {
  inScope(dir);
  writeFileSync(join(dir, "other.mjs"), "export const b = 1;\n");
};

test("close refuses to write Evidence when a changed file falls outside Scope", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo({ change: outOfScope }, ({ dir, base, head, file }) => {
    assert.throws(
      () => ticketLib.closeTicket({ file, root: dir, base, head, evidence: "gate green", resolution: "merged" }),
      /scope-undeclared/,
    );
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: claimed$/m);
    assert.doesNotMatch(text, /^Evidence:/m);
  });
});

test("close refuses to write Evidence when the head commit contract mismatches", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo(
    { change: inScope, trailer: "Ticket: sh-16\nChange-contract: test/ticket/renamed.test.mjs:red->green" },
    ({ dir, base, head, file }) => {
      assert.throws(
        () => ticketLib.closeTicket({ file, root: dir, base, head, evidence: "gate green", resolution: "merged" }),
        /contract-mismatch/,
      );
      const text = readFileSync(file, "utf8");
      assert.match(text, /^Status: claimed$/m);
      assert.doesNotMatch(text, /^Evidence:/m);
    },
  );
});

test("close records evidence once scope and contract both verify", async () => {
  const ticketLib = await loadTicket();
  assert.ok(ticketLib, "scripts/lib/ticket/ticket.mjs must load");
  withRepo({ change: inScope }, ({ dir, base, head, file }) => {
    const result = ticketLib.closeTicket({ file, root: dir, base, head, evidence: "gate green", resolution: "merged" });
    assert.equal(result.status, "done");
    const text = readFileSync(file, "utf8");
    assert.match(text, /^Status: done$/m);
    assert.match(text, /^Evidence: gate green; integrated=[0-9a-f]{40}; patch=[0-9a-f]{40}$/m);
  });
});

test("the CLI refuses an out-of-scope close and passes a verified one", () => {
  const run = (dir, base, head) =>
    spawnSync(
      process.execPath,
      [cli, "ticket", "close", "--root", dir, "--id", "sh-16", "--base", base, "--head", head, "--evidence", "gate green", "--resolution", "merged"],
      { encoding: "utf8" },
    );
  withRepo({ change: outOfScope }, ({ dir, base, head, file }) => {
    const refused = run(dir, base, head);
    assert.notEqual(refused.status, 0, `${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /scope-undeclared/);
    assert.match(refused.stderr, /other\.mjs/);
    assert.match(readFileSync(file, "utf8"), /^Status: claimed$/m);
  });
  withRepo({ change: inScope }, ({ dir, base, head, file }) => {
    const closed = run(dir, base, head);
    assert.equal(closed.status, 0, `${closed.stdout}${closed.stderr}`);
    assert.match(readFileSync(file, "utf8"), /^Status: done$/m);
  });
});

test("the publication policy requires a squash body to carry the Ticket trailer", () => {
  const protocol = readFileSync(join(root, "docs", "research", "ticket-protocol.md"), "utf8");
  const publication = /- Publication:([\s\S]*?)(?:\n- |\n\n|$)/.exec(protocol)?.[1] ?? "";
  assert.match(publication, /squash[\s\S]*`Ticket: <id>`/i);
});
