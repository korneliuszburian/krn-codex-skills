import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./run-handoff.sh", import.meta.url));

function handoff(role) {
  return `<claude-handoff>
## Objective
Produce one bounded candidate.
## Role and completion
- Role: ${role}
## Continue from
Fixed point.
## Sources
Named source.
## Work
One action.
## Deliverables
One candidate.
## Proof boundaries
Advisory only.
## Safety and ownership
Disposable worktree only.
## Suggested skills
Implement.
</claude-handoff>
`;
}

test("routes researcher away from the edit-capable background handoff", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("researcher"));
    const result = spawnSync("bash", [scriptPath, "research job", handoffFile], {
      encoding: "utf8",
    });
    assert.equal(result.status, 65);
    assert.match(result.stderr, /use run-research\.mjs for researcher/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("requires explicit edit authority for rewrite-maker", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    const result = spawnSync("bash", [scriptPath, "rewrite job", handoffFile], {
      encoding: "utf8",
    });
    assert.equal(result.status, 65);
    assert.match(result.stderr, /require explicit --accept-edits authority/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses a relative --add-dir path", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", "relative/extra", "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 65);
    assert.match(result.stderr, /absolute one-line path/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses --add-dir inside a protected agent-configuration directory", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", path.join(os.homedir(), ".codex"), "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 65);
    assert.match(result.stderr, /broad or agent-configuration/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses a hard-quarantined superpowers --add-dir path", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const superpowersDir = path.join(sandbox, "superpowers-cache");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    fs.mkdirSync(superpowersDir);
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", superpowersDir, "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 65);
    assert.match(result.stderr, /hard-quarantined/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses --add-dir that is not a directory", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const notDir = path.join(sandbox, "not-a-dir");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    fs.writeFileSync(notDir, "file, not a directory");
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", notDir, "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 66);
    assert.match(result.stderr, /not a directory/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("refuses --add-dir that is the home directory itself", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", os.homedir(), "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 65);
    assert.match(result.stderr, /broad or agent-configuration/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("accepts a valid --add-dir and proceeds past the directory guard", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const extraDir = path.join(sandbox, "extra-context");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite-maker"));
    fs.mkdirSync(extraDir);
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", extraDir, "job-name", handoffFile],
      { encoding: "utf8" },
    );
    // A valid --add-dir is accepted; the run then reaches the rewrite-maker
    // authority check, proving the directory guard did not block it.
    assert.equal(result.status, 65);
    assert.match(result.stderr, /require explicit --accept-edits authority/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
