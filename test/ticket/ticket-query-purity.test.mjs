import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(root, "scripts", "krn.mjs");

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const commit = (dir, message) => git(dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message);
const run = (dir, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-query-purity-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "lab@krn.local");
  git(dir, "config", "user.name", "lab");
  mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
  mkdirSync(join(dir, ".krn", "runs"), { recursive: true });
  writeFileSync(join(dir, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");

  const file = join(dir, ".krn/tickets", "query-01.md");
  writeFileSync(file, [
    "<krn-ticket>",
    "Id: query-01",
    "Title: Recover an interrupted integration",
    "Status: claimed",
    "Type: task",
    "Repository-base: main",
    "Scope: work.txt",
    "Deciding check: node --test test/ticket/ticket-query-purity.test.mjs",
    "Contract: test/ticket/ticket-query-purity.test.mjs:red->green",
    "Acceptance: queries preserve this ticket while explicit reconciliation closes it",
    "Blocked by: none",
    "Recall: auto",
    "Execution: agent=maintainer; model=unreported; effort=unreported; parallel=none",
    "Gate: none",
    "Claim: worker=lane; session=fixture; at=2020-01-01T00:00:00.000Z; epoch=1; renew=2020-01-01T00:00:00.000Z; duration=1",
    "</krn-ticket>",
    "",
  ].join("\n"));
  writeFileSync(join(dir, ".krn", "runs", "seed.txt"), "seed\n");
  git(dir, "add", "-A");
  commit(dir, "seed query fixture");
  const base = git(dir, "rev-parse", "HEAD");

  git(dir, "checkout", "-q", "-b", "ticket/lane");
  writeFileSync(join(dir, "work.txt"), "integrated work\n");
  git(dir, "add", "work.txt");
  commit(dir, "work\n\nTicket: query-01");
  const lane = git(dir, "rev-parse", "HEAD");
  const diff = execFileSync("git", ["-C", dir, "diff", `${base}..ticket/lane`], { encoding: "utf8" });
  const patch = execFileSync("git", ["-C", dir, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim().split(/\s+/)[0];

  git(dir, "checkout", "-q", "main");
  git(dir, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "merge", "--no-ff", "ticket/lane", "-m", "merge lane");
  const original = readFileSync(file, "utf8").replace("</krn-ticket>", `Integration: branch=ticket/lane; sha=${lane}; patch=${patch}\n</krn-ticket>`);
  writeFileSync(file, original);
  return { dir, file, original };
}

test("ticket check, next, and state check observe without reconciling; explicit reconcile repairs", () => {
  const { dir, file, original } = makeRepo();
  try {
    const queries = [
      ["ticket", "check", "--root", dir, "--path", ".krn/tickets", "--json"],
      ["ticket", "next", "--root", dir, "--path", ".krn/tickets", "--json"],
      ["state", "check", "--root", dir, "--json"],
    ];
    for (const args of queries) {
      writeFileSync(file, original);
      const result = run(dir, ...args);
      assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
      assert.equal(readFileSync(file, "utf8"), original, `${args.join(" ")} changed ticket bytes`);
    }

    const repaired = run(dir, "ticket", "reconcile", "--root", dir, "--path", ".krn/tickets", "--json");
    assert.equal(repaired.status, 0, repaired.stderr);
    assert.deepEqual(JSON.parse(repaired.stdout).reconciled, ["query-01"]);
    assert.match(readFileSync(file, "utf8"), /^Status: done$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
