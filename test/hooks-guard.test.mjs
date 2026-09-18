import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hook = join(root, "scripts", "hooks", "krn_pretooluse.py");
const precompact = join(root, "scripts", "hooks", "krn_memory.py");

function precompactContext(cwd, event = "PreCompact") {
  const payload = JSON.stringify({ hook_event_name: event, cwd });
  const result = spawnSync("python3", ["-B", precompact], { input: payload, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, event);
  return output.additionalContext;
}

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

test("a destructive glob or expansion target names the concrete-path rule", () => {
  const glob = decision("Bash", "rm -rf build/*");
  assert.ok(glob, "rm with a glob must stay blocked");
  assert.match(glob, /name one concrete path/, glob);
  const expansion = decision("Bash", 'rm -rf "$TARGET"');
  assert.ok(expansion, "rm with an expansion must stay blocked");
  assert.match(expansion, /name one concrete path/, expansion);
});

test("a destructive pipe without expansion keeps the composition message", () => {
  const reason = decision("Bash", "rm -rf build | tee log");
  assert.ok(reason, "a destructive pipe must stay blocked");
  assert.match(reason, /shell composition/, reason);
});

test("a read-only writer under a || fallback is allowed, a protected one is not", () => {
  assert.equal(decision("Bash", "sed -n 1,5p README.md || true"), null, "a read-only sed || true must be allowed");
  assert.ok(decision("Bash", "tee .env || true"), "a protected writer under || must stay denied");
  assert.ok(decision("Bash", "rm -rf .git || true"), "a protected rm under || must stay denied");
});

test("a read-only pipeline survives composition the static parser cannot read", () => {
  assert.equal(
    decision("Bash", "git status --short && rg --files docs/design | sort | sed -n '1,240p'"),
    null,
    "a read-only pipeline with sed -n must be allowed",
  );
  assert.equal(
    decision("Bash", 'printf \'%s\\n\' "--- x ---" && node -e "console.log(1)"'),
    null,
    "a read-only text chain must be allowed",
  );
});

test("a mutating writer hidden in a pipeline still fails closed", () => {
  assert.ok(
    decision("Bash", "rg x | sort && sed -i s/a/b/ .env"),
    "a protected in-place write inside a pipeline must stay denied",
  );
  assert.ok(
    decision("Bash", "sort && chmod -R 000 .git/*"),
    "a glob writer target inside a pipeline must stay denied",
  );
});

test("PreCompact injects a continuing capsule and ignores a completed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-precompact-"));
  try {
    assert.equal(precompactContext(dir), null, "no capsule means no injected context");
    const make = (id, outcome, next) => {
      const capsule = join(dir, ".krn", "runs", "delivery-loop", id);
      mkdirSync(capsule, { recursive: true });
      writeFileSync(join(capsule, "state.md"), [
        `Outcome state: ${outcome}`,
        `Next bounded owner and action: ${next}`,
        "Open unknowns and blockers with owners: none",
        "Outcome and observable acceptance: run `npm test`",
        "",
      ].join("\n"));
    };
    make("out-1", "ACTIVE", "update src/b.mjs and run npm test");
    const context = precompactContext(dir);
    assert.match(context, /update src\/b\.mjs and run npm test/);
    assert.match(context, /out-1/);
    const boundary = readFileSync(join(dir, ".krn", "runs", "delivery-loop", "out-1", "boundary.md"), "utf8");
    assert.match(boundary, /next bounded action: update src\/b\.mjs and run npm test/);
    make("out-2", "COMPLETE", "do not continue this");
    const after = precompactContext(dir);
    assert.doesNotMatch(after, /do not continue this/);
    assert.throws(() => readFileSync(join(dir, ".krn", "runs", "delivery-loop", "out-2", "boundary.md")), "a completed capsule gets no boundary file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStart loads a continuing capsule without writing a boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-sessionstart-"));
  try {
    assert.equal(precompactContext(dir, "SessionStart"), null, "no capsule means no loaded context");
    const capsule = join(dir, ".krn", "runs", "delivery-loop", "out-1");
    mkdirSync(capsule, { recursive: true });
    writeFileSync(join(capsule, "state.md"), [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: finish the slice",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: run `npm test`",
      "",
    ].join("\n"));
    assert.match(precompactContext(dir, "SessionStart"), /finish the slice/);
    assert.throws(() => readFileSync(join(capsule, "boundary.md")), "SessionStart must not write a boundary file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStart signals adoption only for an unmanaged work tree with agent instructions", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-onboard-"));
  try {
    assert.equal(precompactContext(dir, "SessionStart"), null, "a plain directory gets no signal");
    mkdirSync(join(dir, ".git"));
    assert.equal(precompactContext(dir, "SessionStart"), null, "a work tree without agent instructions gets no signal");
    writeFileSync(join(dir, "AGENTS.md"), "# Demo\n");
    const signal = precompactContext(dir, "SessionStart");
    assert.match(signal, /KRN onboarding/);
    assert.match(signal, /krn repo inspect/);
    assert.equal(precompactContext(dir, "PreCompact"), null, "PreCompact never signals onboarding");
    writeFileSync(join(dir, "AGENTS.md"), "# Demo\n\n<!-- krn-agent-workflow:start -->\nmanaged\n<!-- krn-agent-workflow:end -->\n");
    assert.equal(precompactContext(dir, "SessionStart"), null, "an adopted repository gets no signal");
    const capsule = join(dir, ".krn", "runs", "delivery-loop", "out-1");
    mkdirSync(capsule, { recursive: true });
    writeFileSync(join(capsule, "state.md"), [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: finish the capsule slice",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: run `npm test`",
      "",
    ].join("\n"));
    writeFileSync(join(dir, "AGENTS.md"), "# Demo\n");
    const capsuleContext = precompactContext(dir, "SessionStart");
    assert.match(capsuleContext, /finish the capsule slice/);
    assert.doesNotMatch(capsuleContext, /KRN onboarding/, "a continuing capsule takes precedence over the onboarding signal");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStart signals adoption from CLAUDE.md when AGENTS.md is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-onboard-claude-"));
  try {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "CLAUDE.md"), "# Demo\n");
    assert.match(precompactContext(dir, "SessionStart"), /KRN onboarding/, "a CLAUDE.md-only work tree signals");
    writeFileSync(join(dir, "CLAUDE.md"), "# Demo\n\n<!-- krn-agent-workflow:start -->\nx\n<!-- krn-agent-workflow:end -->\n");
    assert.equal(precompactContext(dir, "SessionStart"), null, "an adopted CLAUDE.md gets no signal");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

