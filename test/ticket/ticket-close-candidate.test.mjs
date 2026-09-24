import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(repo, "scripts", "krn.mjs");
const contract = "test/ticket/ticket-close-candidate.test.mjs:red->green";
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const commit = (root, message) => git(root, "-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message);
const rev = (root, ref) => git(root, "rev-parse", ref);
const patchId = (root, diff) => execFileSync("git", ["-C", root, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim().split(/\s+/)[0];

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-ticket-close-candidate-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "lab@krn.local");
  git(root, "config", "user.name", "lab");
  mkdirSync(join(root, ".krn/tickets"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  const file = join(root, ".krn/tickets", "sh-177.md");
  writeFileSync(file, [
    "<krn-ticket>",
    "Id: sh-177",
    "Title: Anchor close to the checked head",
    "Status: in-review",
    "Type: bug",
    "Repository-base: main",
    "Scope: src/allowed.mjs",
    "Deciding check: node --test test/ticket/ticket-close-candidate.test.mjs",
    `Contract: ${contract}`,
    "Acceptance: close records the exact head it validated",
    "Blocked by: none",
    "</krn-ticket>",
    "",
  ].join("\n"));
  writeFileSync(join(root, "src", "allowed.mjs"), "export const value = 'base';\n");
  git(root, "add", "-A");
  commit(root, "seed close candidate fixture");
  const base = rev(root, "HEAD");

  git(root, "checkout", "-q", "-b", "ticket/candidate-a");
  writeFileSync(join(root, "src", "allowed.mjs"), "export const value = 'candidate-a';\n");
  git(root, "add", "src/allowed.mjs");
  commit(root, `candidate A\n\nTicket: sh-177\nChange-contract: ${contract}`);
  const candidate = rev(root, "HEAD");

  git(root, "checkout", "-q", "main");
  writeFileSync(join(root, "src", "allowed.mjs"), "export const value = 'checkout-head-b';\n");
  git(root, "add", "src/allowed.mjs");
  commit(root, "later checkout head B");
  const checkoutHead = rev(root, "HEAD");
  return { root, file, base, candidate, checkoutHead };
}

test("close records the exact candidate head it validated", () => {
  const { root, file, base, candidate, checkoutHead } = makeRepo();
  try {
    assert.notEqual(candidate, checkoutHead, "the requested candidate and current checkout head must differ");
    const candidateDiff = execFileSync("git", ["-C", root, "diff", `${base}..${candidate}`], { encoding: "utf8" });
    const expectedPatch = patchId(root, candidateDiff);
    const result = spawnSync(process.execPath, [
      cli, "ticket", "close", "--root", root, "--id", "sh-177",
      "--base", base, "--head", candidate,
      "--evidence", "candidate check passed", "--resolution", "accepted candidate", "--json",
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).anchor.sha, candidate);
    assert.equal(JSON.parse(result.stdout).anchor.patch, expectedPatch);
    assert.match(readFileSync(file, "utf8"), new RegExp(`^Evidence: candidate check passed; integrated=${candidate}; patch=${expectedPatch}$`, "m"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
