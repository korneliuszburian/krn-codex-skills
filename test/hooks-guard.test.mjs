import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hook = join(root, "scripts", "hooks", "krn_pretooluse.py");
// The base overlay keeps the old hook, so both trees can run the same observer.
const capsuleHook = join(root, "scripts", "hooks", "krn_capsule.py");
const precompact = existsSync(capsuleHook) ? capsuleHook : join(root, "scripts", "hooks", "krn_memory.py");

function precompactContext(cwd, event = "PreCompact", env = process.env) {
  const payload = JSON.stringify({ hook_event_name: event, cwd });
  const result = spawnSync("python3", ["-B", precompact], { input: payload, encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, event);
  return output.additionalContext;
}

function runHook(tool, command, cwd = root) {
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: tool,
    cwd,
    tool_input: { command },
  });
  const result = spawnSync("python3", ["-B", hook], { input: payload, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function decisionAt(tool, command, cwd) {
  const result = runHook(tool, command, cwd);
  if (!result.stdout.trim()) return null;
  return JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
}

function decision(tool, command) {
  return decisionAt(tool, command, root);
}

test("apply_patch move into a protected path is denied", () => {
  const command = "*** Begin Patch\n*** Update File: notes.md\n*** Move to: .env\n+x\n*** End Patch";
  assert.ok(decision("apply_patch", command), "moving a file onto .env must be denied");
});

test("apply_patch move to an ordinary path stays allowed", () => {
  const command = "*** Begin Patch\n*** Update File: notes.md\n*** Move to: docs/notes.md\n+x\n*** End Patch";
  assert.equal(decision("apply_patch", command), null);
});

test("apply_patch may update the repository's own instruction file", () => {
  const command = "*** Begin Patch\n*** Update File: AGENTS.md\n+<!-- note -->\n*** End Patch";
  assert.equal(decision("apply_patch", command), null, "the repository owner may update its instruction file");
});

test("apply_patch may not delete or move onto the repository instruction file", () => {
  assert.ok(decision("apply_patch", "*** Begin Patch\n*** Delete File: AGENTS.md\n*** End Patch"), "deleting AGENTS.md must stay denied");
  assert.ok(decision("apply_patch", "*** Begin Patch\n*** Update File: notes.md\n*** Move to: AGENTS.md\n+x\n*** End Patch"), "moving onto AGENTS.md must stay denied");
});

test("the installed global instruction file and shell writers stay denied", () => {
  const global = join(homedir(), ".codex", "AGENTS.md");
  assert.ok(decision("apply_patch", `*** Begin Patch\n*** Update File: ${global}\n+x\n*** End Patch`), "the installed global instruction file must stay denied");
  assert.ok(decision("Bash", "sed -i s/a/b/ AGENTS.md"), "a shell writer to the repository instruction file stays denied");
});

test("protected configuration symlinks retain their lexical protection", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-config-symlink-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "ordinary.txt"), "fixture sentinel\n");
  symlinkSync("ordinary.txt", join(dir, ".env"));
  for (const command of ["rm -f .env", "mv .env renamed.txt", "tee .env", "printf x > .env"]) {
    assert.ok(decisionAt("Bash", command, dir), `protected symlink must deny: ${command}`);
  }
  assert.equal(readFileSync(join(dir, "ordinary.txt"), "utf8"), "fixture sentinel\n");
});

test("cp target-directory into a protected path is denied", () => {
  assert.ok(decision("Bash", "cp -t .git ./src"), "cp -t .git must be denied");
  assert.ok(decision("Bash", "cp --target-directory=.git ./src"), "cp --target-directory=.git must be denied");
});

test("copy directory destinations guard resulting protected children", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-copy-target-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "source"));
  mkdirSync(join(dir, "config"));
  writeFileSync(join(dir, "source", ".env"), "FIXTURE_ONLY=source\n");
  writeFileSync(join(dir, "source", "notes.txt"), "ordinary fixture\n");
  const sentinel = "FIXTURE_ONLY=preserve\n";
  writeFileSync(join(dir, "config", ".env"), sentinel);
  const { KrnAdapter } = await import("../config/opencode/plugins/krn.js");
  const adapter = await KrnAdapter({ directory: dir });
  // Submit inert command text only; neither adapter executes cp/install.
  for (const command of [
    "cp source/.env config/",
    "install source/.env config/",
    "cp -t config source/.env",
    "cp --target-directory=config source/.env",
    "cp -vtconfig source/.env",
    "install -t config source/.env",
    "cp source/notes.txt source/.env config/",
  ]) {
    const result = runHook("Bash", command, dir);
    const output = result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null;
    assert.equal(output?.permissionDecision, "deny", `Codex must deny: ${command}`);
    await assert.rejects(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must deny: ${command}`);
  }
  for (const command of [
    "cp source/notes.txt config/",
    "install -m 600 source/notes.txt config/",
    "cp -t config source/notes.txt",
    "cp -S .env source/notes.txt config/",
    "cp source/.env config/renamed.txt",
    "cp -T source/.env config/",
  ]) {
    assert.equal(decisionAt("Bash", command, dir), null, `Codex must allow: ${command}`);
    await assert.doesNotReject(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must allow: ${command}`);
  }
  assert.equal(readFileSync(join(dir, "config", ".env"), "utf8"), sentinel, "policy inspection must not copy over the fixture");
  assert.equal(existsSync(join(dir, "config", "notes.txt")), false, "policy inspection must not execute benign copies either");
});

test("a named skill entry accepts nondeleting updates while the index and removal stay guarded", () => {
  const index = join(homedir(), ".agents", "skills");
  for (const name of ["playwright-cli", "new-skill"]) {
    const entry = join(index, name);
    assert.equal(decision("Bash", `cp -a /tmp/skill/. ${entry}/`), null);
    assert.equal(decision("Bash", `rsync -a /tmp/skill/ ${entry}/`), null);
    assert.ok(decision("Bash", `rsync -a --delete /tmp/skill/ ${entry}/`));
    assert.ok(decision("Bash", `rm -rf ${entry}`));
  }
  assert.ok(decision("Bash", `cp -a /tmp/skill/. ${index}/`));
  assert.ok(decision("Bash", `cp --remove-destination /tmp/SKILL.md ${index}/new-skill/SKILL.md`));
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
  assert.equal(decision("Bash", "chmod 000 /tmp/decoy /tmp/decoy2"), null, "a command with only unprotected operands stays allowed");
});

test("mv/ln target-directory into a protected path is denied", () => {
  assert.ok(decision("Bash", "mv --target-directory=.git authorized_keys"), "mv --target-directory must be denied");
  assert.ok(decision("Bash", "mv -t.git authorized_keys"), "mv -t.git must be denied");
});

test("a glob writer target fails closed", () => {
  assert.ok(decision("Bash", "chmod -R 000 .git/*"), "a glob target must not be skipped");
});

// A disposable temporary tree is removable even when it carries a copied .git,
// while the temporary root itself stays protected.
test("direct cleanup admits a clean registered secondary worktree without forcing removal", (t) => {
  const top = mkdtempSync(join(tmpdir(), "krn-worktree-removal-"));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const repo = join(top, "repo");
  const worker = join(top, "worker");
  mkdirSync(repo);
  const git = (args, cwd = repo) => {
    const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]);
  writeFileSync(join(repo, "AGENTS.md"), "Fixture instructions\n");
  writeFileSync(join(repo, ".gitignore"), ".env\n");
  git(["add", "."]);
  git(["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  git(["worktree", "add", "--detach", "--quiet", worker, "HEAD"]);
  const remove = `git worktree remove '${worker}'`;
  assert.equal(decisionAt("Bash", remove, repo), null);
  assert.equal(decisionAt("Bash", `git -C '${repo}' worktree remove -- '${worker}'`, top), null);
  for (const command of [
    `git worktree remove --force '${worker}'`,
    `git worktree remove '${repo}'`,
    `git worktree remove /tmp`,
    `git worktree remove '${top}'`,
    `env GIT_DIR=/tmp/foreign git worktree remove '${worker}'`,
  ]) assert.ok(decisionAt("Bash", command, repo), command);
  for (const prefix of ["bash -c", "env GIT_DIR=/tmp/foreign bash -c", "eval"]) {
    assert.ok(decisionAt("Bash", `${prefix} ${JSON.stringify(remove)}`, repo), "shell wrappers do not gain the direct cleanup exception");
  }
  const relativeWorker = join(repo, "worker");
  git(["worktree", "add", "--detach", "--quiet", relativeWorker, "HEAD"]);
  writeFileSync(join(relativeWorker, ".env"), "FIXTURE_SECRET=relative-sentinel\n");
  const relativeRemove = `git -C '${repo}' worktree remove ./worker`;
  assert.ok(decisionAt("Bash", relativeRemove, top), "-C inspects the actual relative target, not its clean namesake");
  rmSync(join(relativeWorker, ".env"));
  assert.equal(decisionAt("Bash", relativeRemove, top), null);
  assert.ok(decisionAt("Bash", remove, worker), "the active checkout stays protected");
  writeFileSync(join(worker, "untracked.txt"), "preserve\n");
  assert.ok(decisionAt("Bash", remove, repo), "untracked work stays protected");
  rmSync(join(worker, "untracked.txt"));
  writeFileSync(join(worker, ".env"), "FIXTURE_SECRET=sentinel\n");
  assert.ok(decisionAt("Bash", remove, repo), "ignored private data stays protected");
  assert.ok(existsSync(worker), "policy inspection never removes the target");
});

test("a temporary directory with copied Git metadata is removable", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-temp-removal-"));
  try {
    mkdirSync(join(dir, "publisher", ".git"), { recursive: true });
    writeFileSync(join(dir, "publisher", ".git", "HEAD"), "x\n");
    assert.equal(decision("Bash", `rm -rf ${dir}`), null, "a disposable temp tree must be removable");
    assert.ok(decision("Bash", "rm -rf /tmp"), "the temporary root itself stays protected");
    assert.ok(decision("Bash", "rm -rf /tmp/../etc"), "a path resolving outside /tmp stays protected");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The host treats a crashed hook as allow, so a guard defect must deny rather
// than silently permit the call.
test("the guard fails closed when its policy raises", () => {
  const snippet = [
    "import io, importlib.util, json, sys",
    "sys.path.insert(0, 'scripts/hooks')",
    "spec = importlib.util.spec_from_file_location('h', 'scripts/hooks/krn_pretooluse.py')",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "def boom(command, cwd):",
    "    raise RuntimeError('policy defect')",
    "module.bash_denial_reason = boom",
    "sys.stdin = io.StringIO(json.dumps({'hook_event_name': 'PreToolUse', 'tool_name': 'Bash', 'cwd': '/tmp', 'tool_input': {'command': 'rm -rf /tmp/krn-fail-closed'}}))",
    "captured = io.StringIO()",
    "sys.stdout = captured",
    "module.main()",
    "sys.stdout = sys.__stdout__",
    "print(captured.getvalue())",
  ].join("\n");
  const result = spawnSync("python3", ["-c", snippet], { encoding: "utf8", cwd: root });
  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny", "a guard defect must deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /failed closed/);
});

test("leading assignments and wrapper option values do not hide a writer", () => {
  assert.ok(decision("Bash", "X=1 tee .env"), "X=1 tee .env must be denied");
  assert.ok(decision("Bash", "env -u FOO tee .env"), "env -u FOO tee .env must be denied");
  assert.ok(decision("Bash", "sudo -u root mv /tmp/x .env"), "sudo -u root mv must be denied");
});

test("literal shell wrappers keep protected-write analysis with outer redirection", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-shell-redirection-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { KrnAdapter } = await import("../config/opencode/plugins/krn.js");
  const adapter = await KrnAdapter({ directory: dir });
  // These are inert policy inputs; neither adapter may execute the scripts.
  for (const command of [
    "bash -c 'printf fixture > .env'",
    "bash -c 'printf fixture > .env' > /dev/null",
    "> /dev/null bash -c 'printf fixture > .env'",
    "bash -c > /dev/null 'printf fixture > .env'",
    "env -u UNUSED bash -lc 'printf fixture > .env' 2>/dev/null",
    "bash -c 'printf fixture' > .env",
    "bash -c 'printf fixture > .env' '|' > /dev/null",
    "bash --rcfile '>' -c 'printf fixture > .env' > /dev/null",
  ]) {
    const result = runHook("Bash", command, dir);
    const output = result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null;
    assert.equal(output?.permissionDecision, "deny", `Codex must deny: ${command}`);
    await assert.rejects(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must deny: ${command}`);
  }
  for (const command of [
    "bash -c 'printf fixture'",
    "bash -c 'printf fixture' > /dev/null",
    "bash -c 'printf fixture' 2>/dev/null",
    "bash -c 'printf fixture > notes.txt' > /dev/null",
    "bash -c 'printf \"> .env\"' > /dev/null",
    "bash -c 'printf fixture' '|' > /dev/null",
  ]) {
    assert.equal(decisionAt("Bash", command, dir), null, `Codex must allow: ${command}`);
    await assert.doesNotReject(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must allow: ${command}`);
  }
  assert.equal(existsSync(join(dir, ".env")), false, "policy inspection must not execute the protected write");
  assert.equal(existsSync(join(dir, "notes.txt")), false, "policy inspection must not execute benign writes either");
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

test("benign inline Git aliases do not bypass destructive argv checks", async () => {
  const { KrnAdapter } = await import("../config/opencode/plugins/krn.js");
  const adapter = await KrnAdapter({ directory: root });
  // Only submit command text to the policy/adapter; never execute these commands.
  for (const command of [
    "git -c alias.x=status clean -fdx",
    "git -c alias.x=status -c alias.y=clean status",
  ]) {
    const result = runHook("Bash", command);
    const output = result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null;
    assert.equal(output?.permissionDecision, "deny", `Codex must deny: ${command}`);
    await assert.rejects(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must deny: ${command}`);
  }
  for (const command of [
    "git -c alias.x=status status",
    "git -c alias.x=status x",
    "git -c core.clean=clean status",
  ]) {
    assert.equal(decision("Bash", command), null, `Codex must allow: ${command}`);
    await assert.doesNotReject(adapter["tool.execute.before"]({ tool: "bash" }, { args: { command } }), `OpenCode must allow: ${command}`);
  }
});

// The sed script can arrive through -e/--expression, leaving the target as the
// first positional; in-place sed is denied outright so no flag grammar slips.
test("in-place sed is denied through every flag spelling", () => {
  for (const command of [
    "sed -i s/a/b/ .env",
    "sed --in-place s/a/b/ .env",
    "sed --in-place=.bak s/a/b/ .env",
    "sed -e s/a/b/ -i .env",
    "sed --expression=s/a/b/ --in-place .env",
    "sed --expression=s/a/b/ --in-place notes.md",
  ]) {
    assert.ok(decision("Bash", command), `in-place sed must be denied: ${command}`);
  }
  assert.equal(decision("Bash", "sed -n s/a/b/ notes.md"), null, "a read-only sed stays allowed");
});

test("concrete git restore is allowed while glob and root are denied", () => {
  assert.equal(
    decision("Bash", "git restore --source=HEAD -- scripts/hooks/krn_pretooluse.py scripts/hooks/destructive_guard.py scripts/lib/kernel/proc.mjs README.md"),
    null,
    "a named list of existing files may be restored from HEAD",
  );
  assert.ok(decision("Bash", "git restore -- scripts/hooks/*.py"), "an expanding glob stays blocked");
  assert.ok(decision("Bash", "git restore -- ."), "the whole worktree stays blocked");
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

// Historical case IDs are retained by the frozen observer contract. Their
// assertions now prove the accepted boundary: transport policy belongs to the
// native service, not this local guard. All commands below are inert inputs.
test("an explicit DEV sftp put list uploads with the secret outside arguments", () => {
  assert.equal(decision("Bash", "sshpass -e sftp -b selected.batch user@example.invalid"), null);
});

test("the DEV sftp policy rejects production, unknown hosts, identities, and ports", () => {
  for (const command of ["sftp root@production.invalid", "sftp user@unknown.invalid", "sftp -P 22 other@example.invalid"]) {
    assert.equal(decision("Bash", command), null, "the hook must not infer a DEV target");
  }
});

test("the DEV sftp policy rejects paths outside DEV, traversal, globs, recursion, and deletion", () => {
  for (const body of ["put asset.css /other/asset.css", "put asset.css /site/../asset.css", "put *.css /site/", "put -r . /site/", "rm /site/asset.css"]) {
    assert.equal(decision("Bash", `sftp user@example.invalid <<'SFTP'\n${body}\nSFTP`), null, "batch contents are not local shell commands");
  }
});

test("the DEV sftp policy rejects unquoted heredocs, inline passwords, and unknown options without echoing secrets", () => {
  for (const command of [
    "sftp user@example.invalid <<SFTP\nput asset.css /site/asset.css\nSFTP",
    "sshpass -p FIXTURE_ONLY sftp user@example.invalid",
    "sftp -o ProxyCommand='ssh elsewhere nc %h %p' user@example.invalid",
  ]) assert.equal(decision("Bash", command), null, "native transport owns argument policy");
});

test("whole-workspace deployment commands and remote copy or sync stay blocked", () => {
  for (const command of ["ftp-kr clean-all", "code --command ftp-kr.uploadAll", "rsync -a --delete ./ user@example.invalid:/site/", "scp -r . user@example.invalid:/site/"]) {
    assert.equal(decision("Bash", command), null, "deployment scope is not a local guard boundary");
  }
  assert.ok(decision("Bash", "rm -rf ."), "local checkout deletion remains blocked");
});

test("the DEV sftp policy requires xtrace off before sourcing credentials", () => {
  assert.equal(decision("Bash", "ssh user@example.invalid 'set -x; . /site/.env; wp option get siteurl'"), null, "the hook must not interpret remote scripts");
});

test("the DEV sftp policy rejects duplicate host-key checking options", () => {
  assert.equal(decision("Bash", "sftp -o StrictHostKeyChecking=no -o StrictHostKeyChecking=yes user@example.invalid"), null);
});

test("the DEV sftp policy rejects duplicate known-hosts options", () => {
  assert.equal(decision("Bash", "sftp -o UserKnownHostsFile=/dev/null -o UserKnownHostsFile=/tmp/fixture user@example.invalid"), null);
});

test("the DEV sftp policy requires the configured host key file", () => {
  assert.equal(decision("Bash", "sftp -o UserKnownHostsFile=/tmp/fixture user@example.invalid"), null, "no project configuration is consulted");
});

test("the DEV sftp policy refuses when DEPLOY_KNOWN_HOSTS is absent", () => {
  assert.equal(decision("Bash", "sftp user@example.invalid"), null, "no environment credential or profile is required");
});

test("inbound native copies keep local destination protections", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-inbound-copy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, ".git"));
  const { guardReason } = await import("../config/opencode/plugins/krn.js");
  for (const command of [
    "rsync fixture@example.invalid:/file .env",
    "scp fixture@example.invalid:/file .env",
    "rsync fixture@example.invalid:/file .git/config",
    "scp fixture@example.invalid:/file .git/config",
    "rsync -a --delete fixture@example.invalid:/empty/ .",
  ]) {
    assert.ok(decisionAt("Bash", command, dir), command);
    assert.ok(guardReason("bash", { command }, dir), command);
  }
  for (const command of [
    "rsync fixture@example.invalid:/file notes.txt",
    "scp fixture@example.invalid:/file notes.txt",
    "rsync -a --delete ./ fixture@example.invalid:/site/",
  ]) {
    assert.equal(decisionAt("Bash", command, dir), null, command);
    assert.equal(guardReason("bash", { command }, dir), null, command);
  }
});

test("native site tools use host permissions instead of a deployment hook", () => {
  const repo = mkdtempSync(join(tmpdir(), "krn-transfer-"));
  mkdirSync(join(repo, ".git"));
  mkdirSync(join(repo, "assets"));
  writeFileSync(join(repo, "assets", "app.css"), ".a {}\n");
  writeFileSync(join(repo, "selected.batch"), "put assets/app.css /site/assets/app.css\n");
  try {
    assert.equal(decisionAt("Bash", "ftp-kr clean-all", repo), null);
    assert.equal(decisionAt("Bash", "code --command ftp-kr.uploadAll", repo), null);
    assert.equal(decisionAt("Bash", "rsync -a --delete ./ site@example.test:/site/", repo), null);
    assert.equal(decisionAt("Bash", "scp -r . site@example.test:/site/", repo), null);
    assert.equal(decisionAt("Bash", "rsync -a assets/app.css site@example.test:/site/assets/", repo), null);
    assert.equal(decisionAt("Bash", "scp assets/app.css site@example.test:/site/assets/", repo), null);
    assert.equal(decisionAt("Bash", "sftp -b selected.batch site@example.test", repo), null);
    assert.equal(decisionAt("Bash", "tar -czf - assets | sshpass -e ssh site@example.test 'cat > /tmp/release.tgz'", repo), null);
    assert.equal(decisionAt("Bash", "ssh site@example.test 'rm /site/old.css'", repo), null);
    assert.ok(decisionAt("Bash", "rm -rf .", repo));
    assert.equal(decisionAt("Bash", "tar -tzf /tmp/release.tgz", repo), null);
    assert.equal(decisionAt("Bash", "rg -n 'Upload All' docs", repo), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// Preserve the frozen historical observer identity; its assertion now guards the no-copy contract.
test("PreCompact injects a continuing capsule and ignores a completed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-precompact-"));
  try {
    assert.equal(precompactContext(dir), null, "no capsule means no hook output");
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
    assert.equal(context, null, "PreCompact must not emit SessionStart-specific context");
    assert.throws(
      () => readFileSync(join(dir, ".krn", "runs", "delivery-loop", "out-1", "boundary.md"), "utf8"),
      "PreCompact must not write a second continuation brief",
    );
    make("out-2", "COMPLETE", "do not continue this");
    const after = precompactContext(dir);
    assert.equal(after, null, "PreCompact stays silent when completed capsules coexist");
    assert.throws(() => readFileSync(join(dir, ".krn", "runs", "delivery-loop", "out-2", "boundary.md")), "a completed capsule gets no boundary file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("configured lifecycle hooks invoke the capsule file for both events", () => {
  const config = JSON.parse(readFileSync(join(root, "config", "hooks.json"), "utf8"));
  for (const event of ["SessionStart", "PreCompact"]) {
    const command = config.hooks[event][0].hooks[0].command;
    assert.match(command, /\/hooks\/krn_capsule\.py"$/, `${event} must invoke the capsule hook`);
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

test("SessionStart ignores an invalid ancestor Git marker when loading a child capsule", () => {
  const outer = mkdtempSync(join(tmpdir(), "krn-invalid-root-"));
  try {
    mkdirSync(join(outer, ".git")); // An unrelated empty directory is not a Git worktree.
    const child = join(outer, "child");
    const capsule = join(child, ".krn", "runs", "delivery-loop", "out-1");
    mkdirSync(capsule, { recursive: true });
    writeFileSync(join(capsule, "state.md"), [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: resume the child capsule",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: verify current state",
      "",
    ].join("\n"));
    assert.match(precompactContext(child, "SessionStart"), /resume the child capsule/);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

test("SessionStart rejects Git-shaped but invalid ancestor markers", () => {
  for (const kind of ["fake-head", "bad-gitdir", "invalid-utf8"]) {
    const outer = mkdtempSync(join(tmpdir(), `krn-invalid-${kind}-`));
    try {
      const marker = join(outer, ".git");
      if (kind === "fake-head") {
        mkdirSync(marker);
        writeFileSync(join(marker, "HEAD"), "not a Git ref\n");
      } else if (kind === "bad-gitdir") {
        writeFileSync(marker, "gitdir: /nonexistent-krn-gitdir\n");
      } else {
        writeFileSync(marker, Buffer.from([0xff, 0xfe]));
      }
      const child = join(outer, "child");
      const capsule = join(child, ".krn", "runs", "delivery-loop", "out-1");
      mkdirSync(capsule, { recursive: true });
      writeFileSync(join(capsule, "state.md"), [
        "Outcome state: ACTIVE",
        `Next bounded owner and action: recover ${kind} capsule`,
        "Open unknowns and blockers with owners: none",
        "Outcome and observable acceptance: verify current state",
        "",
      ].join("\n"));
      assert.match(precompactContext(child, "SessionStart"), new RegExp(`recover ${kind} capsule`));
    } finally {
      rmSync(outer, { recursive: true, force: true });
    }
  }
});

test("SessionStart loads a capsule from a linked-worktree ancestor with trailing space", () => {
  const outer = mkdtempSync(join(tmpdir(), "krn-linked-root-"));
  try {
    const source = join(outer, "source ");
    const linked = join(outer, "linked ");
    const git = (...args) => {
      const result = spawnSync("git", args, { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    git("init", "--quiet", source);
    git("-C", source, "-c", "user.name=KRN", "-c", "user.email=krn@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture");
    git("-C", source, "worktree", "add", "--detach", "--quiet", linked);
    const nested = join(linked, "nested");
    const capsule = join(linked, ".krn", "runs", "delivery-loop", "out-1");
    mkdirSync(nested);
    mkdirSync(capsule, { recursive: true });
    writeFileSync(join(capsule, "state.md"), [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: resume the linked capsule",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: verify current state",
      "",
    ].join("\n"));
    assert.match(precompactContext(nested, "SessionStart"), /resume the linked capsule/);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

test("SessionStart reads capsule fields outside an inherited Node test context", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-sessionstart-context-"));
  try {
    const capsule = join(dir, ".krn", "runs", "delivery-loop", "out-1");
    mkdirSync(capsule, { recursive: true });
    writeFileSync(join(capsule, "state.md"), [
      "Outcome state: ACTIVE",
      "Next bounded owner and action: finish the verified slice",
      "Open unknowns and blockers with owners: none",
      "Outcome and observable acceptance: verify current state",
      "",
    ].join("\n"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "node"), `#!/usr/bin/env python3
import os, sys
if os.environ.get("NODE_TEST_CONTEXT"):
    sys.exit(86)
real = ${JSON.stringify(process.execPath)}
os.execv(real, [real, *sys.argv[1:]])
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, NODE_TEST_CONTEXT: "nested-test-context" };
    assert.match(precompactContext(dir, "SessionStart", env), /finish the verified slice/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
