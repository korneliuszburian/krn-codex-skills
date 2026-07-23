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
