import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hook = join(root, "scripts", "hooks", "krn_pretooluse.py");

function decision(tool, command) {
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: tool,
    cwd: root,
    tool_input: { command },
  });
  const result = spawnSync("python3", ["-B", hook], { input: payload, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  return JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
}

test("apply_patch move into a protected path is denied", () => {
  const command = "*** Begin Patch\n*** Update File: notes.md\n*** Move to: .env\n+x\n*** End Patch";
  assert.ok(decision("apply_patch", command), "moving a file onto .env must be denied");
});

test("apply_patch move to an ordinary path stays allowed", () => {
  const command = "*** Begin Patch\n*** Update File: notes.md\n*** Move to: docs/notes.md\n+x\n*** End Patch";
  assert.equal(decision("apply_patch", command), null);
});

test("cp target-directory into a protected path is denied", () => {
  assert.ok(decision("Bash", "cp -t .git ./src"), "cp -t .git must be denied");
  assert.ok(decision("Bash", "cp --target-directory=.git ./src"), "cp --target-directory=.git must be denied");
});

test("attached short -t target-directory into a protected path is denied", () => {
  assert.ok(decision("Bash", "cp -t.git ./src"), "cp -t.git must be denied");
  assert.ok(decision("Bash", "install -t.git ./src"), "install -t.git must be denied");
  assert.ok(decision("Bash", "cp -vt.git ./src"), "cp -vt.git must be denied");
});
