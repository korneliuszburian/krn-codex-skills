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

test("multi-operand permission commands check every protected operand", () => {
  assert.ok(decision("Bash", "chmod 000 .git/config /tmp/decoy"), "chmod must check every operand");
  assert.ok(decision("Bash", "chown root .git/config /tmp/decoy"), "chown must check every operand");
  assert.ok(decision("Bash", "truncate -s 0 .env /tmp/decoy"), "truncate must check every operand");
});

test("mv/ln target-directory into a protected path is denied", () => {
  assert.ok(decision("Bash", "mv --target-directory=.git authorized_keys"), "mv --target-directory must be denied");
  assert.ok(decision("Bash", "mv -t.git authorized_keys"), "mv -t.git must be denied");
});

test("a glob writer target fails closed", () => {
  assert.ok(decision("Bash", "chmod -R 000 .git/*"), "a glob target must not be skipped");
});

test("leading assignments and wrapper option values do not hide a writer", () => {
  assert.ok(decision("Bash", "X=1 tee .env"), "X=1 tee .env must be denied");
  assert.ok(decision("Bash", "env -u FOO tee .env"), "env -u FOO tee .env must be denied");
  assert.ok(decision("Bash", "sudo -u root mv /tmp/x .env"), "sudo -u root mv must be denied");
});

test("eval inspects all of its operands", () => {
  assert.ok(decision("Bash", "eval rm -rf .env"), "eval rm -rf .env must be denied");
});

test("clustered sed -i, bare git checkout ., and rtk-prefixed writers are denied", () => {
  assert.ok(decision("Bash", "sed -ni s/a/b/ .env"), "sed -ni must be denied");
  assert.ok(decision("Bash", "sed -Ei s/a/b/ .env"), "sed -Ei must be denied");
  assert.ok(decision("Bash", "git checkout ."), "git checkout . must be denied");
  assert.ok(decision("Bash", "rtk proxy mv /tmp/x .env"), "rtk proxy mv must be denied");
});
