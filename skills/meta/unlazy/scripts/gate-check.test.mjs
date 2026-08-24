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
  fs.writeFileSync(path.join(root, ".gitignore"), "GATES.md\n");
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

test("rejects unknown and empty gate attributes", () => {
  const cases = [
    ["unknown", "  CDW: elsewhere", /unknown attribute CDW/],
    ["empty", "  CHECK: ", /G1: CHECK must not be empty/],
  ];
  for (const [name, line, expected] of cases) {
    const { root, ledger } = fixture(`# Gates: attributes ${name}\n\n- [ ] G1: invalid\n${line}\n  EXPECT: ok\n  EVIDENCE: pending\n`);
    try {
      const result = run(["--status", ledger], root);
      assert.equal(result.status, 2, `${name}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, expected);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("rejects a malformed gate-like checkbox line", () => {
  const { root, ledger, approvals } = fixture(`# Gates: malformed\n\n- [ ] G1 missing colon\n- [x] G2: valid but not enough\n  EVIDENCE: reviewed\n`);
  try {
    const result = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /malformed gate line/);
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

test("rejects malformed ABANDON directives", () => {
  const cases = ["ABANDON G1 reason", "ABANDON: G1", "ABANDON:", "ABANDONED G1 reason"];
  for (const directive of cases) {
    const { root, ledger } = fixture(`# Gates: abandon\n\n- [x] G1: impossible\n  EVIDENCE: accepted\n${directive}\n`);
    try {
      const result = run(["--status", ledger], root);
      assert.equal(result.status, 2, `${directive}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /malformed ABANDON directive/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

test("rejects an approval path through a symlinked repository ancestor", () => {
  const { root, ledger } = fixture(`# Gates: symlink boundary\n\n- [ ] G1: command\n  CHECK: node -e \"console.log('ok')\"\n  EXPECT: ok\n  EVIDENCE: pending\n`);
  const link = path.join(path.dirname(root), `${path.basename(root)}-link`);
  try {
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
    fs.symlinkSync(root, link);
    const result = run(["--approve", "--approval-dir", path.join(link, ".krn", "approvals"), ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /approval directory must be outside the repository/);
  } finally {
    fs.rmSync(link, { recursive: true, force: true });
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
    assert.match(approval.environmentHash, /^[a-f0-9]{64}$/);
    const changedPath = run(["--reverify", "--approval-dir", approvals, ledger], root, { PATH: "/tmp/unlazy-different-path" });
    assert.equal(changedPath.status, 1);
    assert.match(changedPath.stdout, /approval invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a ledger that is not ignored before writing evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-unlazy-unignored-"));
  const ledger = path.join(root, "GATES.md");
  const approvals = path.join(root, "..", `${path.basename(root)}-approvals`);
  fs.writeFileSync(ledger, `# Gates: unignored\n\n- [ ] G1: command\n  CHECK: node -e "console.log('ok')"\n  EXPECT: ok\n  EVIDENCE: pending\n`);
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
  try {
    const result = run(["--approve", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /ledger must be ignored before writing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(approvals, { recursive: true, force: true });
  }
});

test("defaults gate CWD to the repository root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-unlazy-cwd-"));
  const ledgerDir = path.join(root, ".krn", "runs", "unlazy", "run");
  const ledger = path.join(ledgerDir, "GATES.md");
  const approvals = path.join(root, "..", `${path.basename(root)}-approvals`);
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), ".krn/runs/\n");
  fs.writeFileSync(ledger, `# Gates: cwd\n\n- [ ] G1: root\n  CHECK: node -e "console.log(process.cwd())"\n  EXPECT: ${root}\n  EVIDENCE: pending\n`);
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
  try {
    const result = run(["--approve", "--approval-dir", approvals, ledger], root);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(approvals, { recursive: true, force: true });
  }
});

test("rejects absolute, traversal, and symlinked CWD outside the repository", () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "krn-unlazy-outside-"));
  const cases = [
    ["absolute", "/tmp", /CWD must be repository-relative/],
    ["traversal", "..", /CWD escapes repository/],
    ["symlink", "outside-link", /CWD escapes repository/],
  ];
  for (const [name, cwd, expected] of cases) {
    const { root, ledger } = fixture(`# Gates: cwd ${name}\n\n- [ ] G1: command must not run\n  CWD: ${cwd}\n  CHECK: node -e "require('fs').writeFileSync('marker.txt','ran')"\n  EXPECT: ignored\n  EVIDENCE: pending\n`);
    try {
      if (name === "symlink") fs.symlinkSync(outside, path.join(root, "outside-link"));
      const result = run(["--approve", ledger], root);
      assert.equal(result.status, 1, `${name}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, expected);
      assert.equal(fs.existsSync(path.join(root, "marker.txt")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  fs.rmSync(outside, { recursive: true, force: true });
});

test("rejects empty, changed, directory, and symlink approval records without executing", () => {
  const mutations = [
    ["empty", (file) => fs.writeFileSync(file, "")],
    ["changed", (file) => fs.writeFileSync(file, "{}\n")],
    ["non-object", (file) => fs.writeFileSync(file, "null\n")],
    ["directory", (file) => { fs.rmSync(file); fs.mkdirSync(file); }],
    ["symlink", (file, root) => { fs.rmSync(file); fs.symlinkSync(path.join(root, "missing-target"), file); }],
  ];
  for (const [name, mutate] of mutations) {
    const { root, ledger, approvals } = fixture(`# Gates: invalid ${name}\n\n- [ ] G1: marker\n  CHECK: node -e \"require('fs').writeFileSync('marker.txt','ran'); console.log('ran')\"\n  EXPECT: ran\n  EVIDENCE: pending\n`);
    try {
      const approved = run(["--approve", "--approval-dir", approvals, ledger], root);
      assert.equal(approved.status, 0, `${name}: ${approved.stdout}\n${approved.stderr}`);
      fs.rmSync(path.join(root, "marker.txt"));
      const record = path.join(approvals, fs.readdirSync(approvals)[0]);
      mutate(record, root);
      const reapproved = run(["--approve", "--approval-dir", approvals, ledger], root);
      assert.equal(reapproved.status, 1, `${name}: ${reapproved.stdout}\n${reapproved.stderr}`);
      assert.match(reapproved.stdout, /approval invalid/);
      assert.equal(fs.existsSync(path.join(root, "marker.txt")), false);
      const reverified = run(["--reverify", "--approval-dir", approvals, ledger], root);
      assert.equal(reverified.status, 1, `${name}: ${reverified.stdout}\n${reverified.stderr}`);
      assert.match(reverified.stdout, /approval invalid/);
      assert.equal(fs.existsSync(path.join(root, "marker.txt")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("clears checked success when reverify loses approval", () => {
  const { root, ledger, approvals } = fixture(`# Gates: stale success\n\n- [ ] G1: command passes\n  CHECK: node -e "console.log('ok')"\n  EXPECT: ok\n  EVIDENCE: pending\n`);
  try {
    const approved = run(["--approve", "--approval-dir", approvals, ledger], root);
    assert.equal(approved.status, 0);
    assert.match(fs.readFileSync(ledger, "utf8"), /- \[x\] G1/);
    const record = path.join(approvals, fs.readdirSync(approvals)[0]);
    fs.writeFileSync(record, "{}\n");
    const reverified = run(["--reverify", "--approval-dir", approvals, ledger], root);
    assert.equal(reverified.status, 1);
    assert.match(reverified.stdout, /approval invalid/);
    const updated = fs.readFileSync(ledger, "utf8");
    assert.match(updated, /- \[ \] G1/);
    assert.match(updated, /EVIDENCE: approval invalid/);
    const status = run(["--status", "--approval-dir", approvals, ledger], root);
    assert.equal(status.status, 1);
    assert.match(status.stdout, /UNMET: 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
