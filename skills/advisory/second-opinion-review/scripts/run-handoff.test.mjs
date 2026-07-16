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
