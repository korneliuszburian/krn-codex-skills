import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = path.resolve("skills/meta/unlazy/scripts/gate-check.mjs");

function fixture(content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-unlazy-test-"));
  const ledger = path.join(root, "GATES.md");
  const approvals = path.join(root, "approvals");
  fs.writeFileSync(ledger, content);
  return { root, ledger, approvals };
}

function run(args, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd, env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
}

test("status parses without executing or writing", () => {
  const { root, ledger, approvals } = fixture(`# Gates: status\n\n- [ ] G1: marker remains absent\n  CHECK: node -e \"require('fs').writeFileSync('marker.txt','bad')\"\n  EXPECT: never\n  EVIDENCE: pending\n`);
  try {
    const before = fs.readFileSync(ledger, "utf8");
    const result = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /UNMET: 1/);
    assert.equal(fs.readFileSync(ledger, "utf8"), before);
    assert.equal(fs.existsSync(path.join(root, "marker.txt")), false);
    assert.equal(fs.existsSync(approvals), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("approve runs a passing gate, records evidence, and leaves manual gates visible", () => {
  const { root, ledger, approvals } = fixture(`# Gates: approve\n\n- [ ] G1: command passes\n  CHECK: node -e \"console.log('gate passed')\"\n  EXPECT: gate passed\n  EVIDENCE: pending\n\n- [ ] G2: human review\n  EVIDENCE: pending\n`);
  try {
    const result = run(["--approve", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 1);
    const updated = fs.readFileSync(ledger, "utf8");
    assert.match(updated, /- \[x\] G1: command passes/);
    assert.match(updated, /exit=0/);
    assert.match(result.stdout, /UNMET: 1/);
    assert.equal(fs.readdirSync(approvals).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("default mode does not execute an unapproved gate", () => {
  const { root, ledger, approvals } = fixture(`# Gates: pending\n\n- [ ] G1: pending command\n  CHECK: node -e \"require('fs').writeFileSync('marker.txt','bad')\"\n  EXPECT: bad\n  EVIDENCE: pending\n`);
  try {
    const result = run(["--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /approval pending/);
    assert.equal(fs.existsSync(path.join(root, "marker.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects duplicate gate ids and incomplete runnable gates", () => {
  const { root, ledger, approvals } = fixture(`# Gates: invalid\n\n- [ ] G1: first\n  CHECK: node -e \"console.log('ok')\"\n  EXPECT: ok\n  EVIDENCE: pending\n- [ ] G1: duplicate\n  EVIDENCE: pending\n- [ ] G2: incomplete\n  CHECK: node -e \"console.log('ok')\"\n  EVIDENCE: pending\n`);
  try {
    const result = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /duplicate gate id G1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an incomplete runnable gate", () => {
  const { root, ledger, approvals } = fixture(`# Gates: incomplete\n\n- [ ] G2: incomplete\n  CHECK: node -e \"console.log('ok')\"\n  EVIDENCE: pending\n`);
  try {
    const result = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /G2: runnable gate requires CHECK and EXPECT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a checked manual gate whose evidence is still pending", () => {
  const { root, ledger, approvals } = fixture(`# Gates: stale manual\n\n- [x] G1: human review\n  EVIDENCE: pending\n`);
  try {
    const result = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /G1: checked gate cannot have pending evidence/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an approval directory inside the repository", () => {
  const { root, ledger } = fixture(`# Gates: approval boundary\n\n- [ ] G1: command passes\n  CHECK: node -e \"console.log('ok')\"\n  EXPECT: ok\n  EVIDENCE: pending\n`);
  try {
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
    const result = run(["--approve", "--approval-dir", path.join(root, ".krn", "approvals"), ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /approval directory must be outside the repository/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("binds approval to PATH, platform, and Node version", () => {
  const { root, ledger, approvals } = fixture(`# Gates: environment binding\n\n- [ ] G1: command passes\n  CHECK: node -e \"console.log('ok')\"\n  EXPECT: ok\n  EVIDENCE: pending\n`);
  try {
    const approved = run(["--approve", "--approval-dir", approvals, ledger], root);
    assert.equal(approved.status, 0);
    const approval = JSON.parse(fs.readFileSync(path.join(approvals, fs.readdirSync(approvals)[0]), "utf8"));
    assert.equal(approval.pathEnv, process.env.PATH);
    assert.equal(approval.platform, process.platform);
    assert.equal(approval.nodeVersion, process.version);
    const changedPath = run(["--reverify", "--approval-dir", approvals, ledger], root, { PATH: "/tmp/unlazy-different-path" });
    assert.equal(changedPath.status, 1);
    assert.match(changedPath.stdout, /approval pending/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
