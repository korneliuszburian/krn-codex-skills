import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("skills/engineering/reviewer-handoff/scripts/prepare-review-packet.mjs");

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-handoff-git-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "reviewer-handoff-test");
  fs.writeFileSync(path.join(root, "allowed.txt"), "base\n");
  fs.writeFileSync(path.join(root, "brief.md"), "# bounded brief\n");
  fs.mkdirSync(path.join(root, "docs", "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "agents", "artifact-paths.json"),
    `${JSON.stringify({ schema_version: 1, working_runs: ".runs" })}\n`,
  );
  fs.mkdirSync(path.join(root, ".runs"));
  fs.writeFileSync(path.join(root, ".runs", ".gitignore"), "*\n!.gitignore\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  fs.writeFileSync(path.join(root, "allowed.txt"), "changed\n");
  git(root, "add", "allowed.txt");
  git(root, "commit", "-qm", "change");
  return root;
}

test("compiles a portable packet for an exact allowlist", () => {
  const root = fixture();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-handoff-output-"));
  const output = path.join(outputRoot, "packet.md");
  execFileSync(process.execPath, [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--output", output], { cwd: root, stdio: "pipe" });
  const packet = fs.readFileSync(output, "utf8");
  assert.match(packet, /Exact changed-path allowlist: PASS/);
  assert.match(packet, /allowed\.txt/);
  assert.match(packet, /change/);
});

test("rejects a commit diff that escapes the allowlist", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "outside.txt"), "outside\n");
  git(root, "add", "outside.txt");
  git(root, "commit", "-qm", "outside");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-handoff-output-")), "packet.md");
  assert.throws(
    () => execFileSync(process.execPath, [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--output", output], { cwd: root, stdio: "pipe" }),
    (error) =>
      error.status === 1 &&
      error.stderr.toString().includes("commit diff escapes allowlist: outside.txt"),
  );
  assert.equal(fs.existsSync(output), false);
});

test("rejects repository-local output without a verified working pass", () => {
  const root = fixture();
  const output = path.join(root, "packet.md");
  assert.throws(
    () => execFileSync(process.execPath, [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--output", output], { cwd: root, stdio: "pipe" }),
    (error) =>
      error.status === 1 &&
      error.stderr.toString().includes("repository-local output requires --working-pass"),
  );
  assert.equal(fs.existsSync(output), false);
});

test("writes repository-local output only inside a private ignored working pass", () => {
  const root = fixture();
  const workingPass = path.join(root, ".runs", "review-pass");
  fs.mkdirSync(workingPass, { mode: 0o700 });
  const output = path.join(workingPass, "packet.md");
  execFileSync(
    process.execPath,
    [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--working-pass", workingPass, "--output", output],
    { cwd: root, stdio: "pipe" },
  );
  assert.match(fs.readFileSync(output, "utf8"), /Exact changed-path allowlist: PASS/);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
});

test("rejects an unignored repository-local working pass", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".runs", ".gitignore"), "!.gitignore\n");
  const workingPass = path.join(root, ".runs", "review-pass");
  fs.mkdirSync(workingPass, { mode: 0o700 });
  const output = path.join(workingPass, "packet.md");
  assert.throws(
    () => execFileSync(process.execPath, [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--working-pass", workingPass, "--output", output], { cwd: root, stdio: "pipe" }),
    (error) =>
      error.status === 1 &&
      error.stderr.toString().includes("repository-local --working-pass must be Git-ignored"),
  );
  assert.equal(fs.existsSync(output), false);
});

test("rejects a private ignored pass outside configured working_runs", () => {
  const root = fixture();
  const otherRoot = path.join(root, ".other-runs");
  const workingPass = path.join(otherRoot, "review-pass");
  fs.mkdirSync(workingPass, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(otherRoot, ".gitignore"), "*\n!.gitignore\n");
  const output = path.join(workingPass, "packet.md");
  assert.throws(
    () => execFileSync(process.execPath, [script, "--base", "HEAD^", "--head", "HEAD", "--path", "allowed.txt", "--brief", "brief.md", "--working-pass", workingPass, "--output", output], { cwd: root, stdio: "pipe" }),
    (error) =>
      error.status === 1 &&
      error.stderr.toString().includes("must be under configured working_runs"),
  );
  assert.equal(fs.existsSync(output), false);
});
