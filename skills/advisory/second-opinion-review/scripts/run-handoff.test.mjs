import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./run-handoff.sh", import.meta.url));
const preparePath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));

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

test("routes research away from the edit-capable background handoff", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("research"));
    const result = spawnSync("bash", [scriptPath, "research job", handoffFile], {
      encoding: "utf8",
    });
    assert.equal(result.status, 65);
    assert.match(result.stderr, /use run-research\.mjs for research/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("requires explicit edit authority for rewrite", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
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
    fs.writeFileSync(handoffFile, handoff("rewrite"));
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

test("refuses an absent protected agent-configuration path lexically", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const protectedConfig = path.join(sandbox, "missing-agent-config");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", protectedConfig, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: protectedConfig },
      },
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
    fs.writeFileSync(handoffFile, handoff("rewrite"));
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
    fs.writeFileSync(handoffFile, handoff("rewrite"));
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
    fs.writeFileSync(handoffFile, handoff("rewrite"));
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
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.mkdirSync(extraDir);
    const result = spawnSync(
      "bash",
      [scriptPath, "--add-dir", extraDir, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    // A valid --add-dir is accepted; the run then reaches the rewrite
    // authority check, proving the directory guard did not block it.
    assert.equal(result.status, 65);
    assert.match(result.stderr, /require explicit --accept-edits authority/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("requires every --add-dir to be below one declared disposable root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const extraDir = path.join(sandbox, "extra-context");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.mkdirSync(extraDir);

    const undeclared = spawnSync(
      "bash",
      [scriptPath, "--add-dir", extraDir, "job-name", handoffFile],
      { encoding: "utf8" },
    );
    assert.equal(undeclared.status, 65);
    assert.match(undeclared.stderr, /requires an absolute SECOND_OPINION_DISPOSABLE_ROOT/);

    const outside = spawnSync(
      "bash",
      [scriptPath, "--add-dir", "/etc", "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(outside.status, 65);
    assert.match(outside.stderr, /strict child of SECOND_OPINION_DISPOSABLE_ROOT/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects Git checkouts and custom agent configuration below the disposable root", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const checkout = path.join(sandbox, "checkout");
  const codexHome = path.join(sandbox, "codex-home");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.mkdirSync(checkout);
    fs.mkdirSync(codexHome);
    const init = spawnSync("git", ["init", "-q", checkout], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);

    const gitResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", checkout, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(gitResult.status, 65);
    assert.match(gitResult.stderr, /not a Git checkout/);

    const configResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", codexHome, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          SECOND_OPINION_DISPOSABLE_ROOT: sandbox,
        },
      },
    );
    assert.equal(configResult.status, 65);
    assert.match(configResult.stderr, /agent-configuration/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects symlink escapes and unsafe content inside disposable copies", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-outside-"));
  const alias = path.join(sandbox, "alias");
  const internal = path.join(sandbox, "internal");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.symlinkSync(outside, alias, "dir");
    fs.mkdirSync(internal);
    fs.symlinkSync(outside, path.join(internal, "escape"), "dir");

    const aliasResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", alias, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(aliasResult.status, 65);
    assert.match(aliasResult.stderr, /must not cross a symlink/);

    const internalResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", internal, "job-name", handoffFile],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(internalResult.status, 65);
    assert.match(internalResult.stderr, /must not contain symlinks/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects same-device directory and file bind mounts below a disposable copy", (t) => {
  const mountProbe = spawnSync(
    "unshare",
    [
      "--user",
      "--map-root-user",
      "--mount",
      "bash",
      "-c",
      'probe=$(mktemp -d) && mkdir "$probe/source" "$probe/target" && mount --bind "$probe/source" "$probe/target" && umount "$probe/target" && rmdir "$probe/source" "$probe/target" "$probe"',
    ],
    { encoding: "utf8" },
  );
  if (mountProbe.status !== 0) {
    t.skip("unprivileged private mounts are unavailable on this host");
    return;
  }

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-mount-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const authoritative = path.join(sandbox, "authoritative");
  const inputCopy = path.join(sandbox, "input");
  const nestedMount = path.join(inputCopy, "mounted");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.mkdirSync(authoritative);
    fs.writeFileSync(path.join(authoritative, "owned.txt"), "authoritative\n");
    fs.mkdirSync(nestedMount, { recursive: true });
    const result = spawnSync(
      "unshare",
      [
        "--user",
        "--map-root-user",
        "--mount",
        "bash",
        "-c",
        'mount --bind "$1" "$2" && exec bash "$3" --add-dir "$4" job-name "$5"',
        "mount-test",
        authoritative,
        nestedMount,
        scriptPath,
        inputCopy,
        handoffFile,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(result.status, 65, result.stderr);
    assert.match(result.stderr, /must not contain nested mounts/);

    const sourceFile = path.join(authoritative, "owned.txt");
    const mountedFile = path.join(inputCopy, "mounted.txt");
    fs.writeFileSync(mountedFile, "placeholder\n");
    const fileResult = spawnSync(
      "unshare",
      [
        "--user",
        "--map-root-user",
        "--mount",
        "bash",
        "-c",
        'mount --bind "$1" "$2" && exec bash "$3" --add-dir "$4" job-name "$5"',
        "file-mount-test",
        sourceFile,
        mountedFile,
        scriptPath,
        inputCopy,
        handoffFile,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox },
      },
    );
    assert.equal(fileResult.status, 65, fileResult.stderr);
    assert.match(fileResult.stderr, /must not contain nested mounts/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects nested Git metadata, quarantined names, and hard-linked files", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-test-"));
  const handoffFile = path.join(sandbox, "handoff.md");
  const nestedGit = path.join(sandbox, "nested-git");
  const quarantined = path.join(sandbox, "quarantined");
  const hardlinked = path.join(sandbox, "hardlinked");
  const unreadable = path.join(sandbox, "unreadable");
  try {
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    fs.mkdirSync(path.join(nestedGit, "vendor", ".git"), { recursive: true });
    fs.mkdirSync(path.join(quarantined, "cached-superpowers"), { recursive: true });
    fs.mkdirSync(hardlinked);
    fs.writeFileSync(path.join(hardlinked, "source.txt"), "shared inode\n");
    fs.linkSync(
      path.join(hardlinked, "source.txt"),
      path.join(hardlinked, "alias.txt"),
    );
    fs.mkdirSync(path.join(unreadable, "hidden"), { recursive: true });
    fs.symlinkSync("/etc", path.join(unreadable, "hidden", "escape"), "dir");
    fs.chmodSync(path.join(unreadable, "hidden"), 0o000);
    const env = { ...process.env, SECOND_OPINION_DISPOSABLE_ROOT: sandbox };

    const gitResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", nestedGit, "job-name", handoffFile],
      { encoding: "utf8", env },
    );
    assert.equal(gitResult.status, 65);
    assert.match(gitResult.stderr, /must not contain Git metadata/);

    const quarantineResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", quarantined, "job-name", handoffFile],
      { encoding: "utf8", env },
    );
    assert.equal(quarantineResult.status, 65);
    assert.match(quarantineResult.stderr, /hard-quarantined content/);

    const hardlinkResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", hardlinked, "job-name", handoffFile],
      { encoding: "utf8", env },
    );
    assert.equal(hardlinkResult.status, 65);
    assert.match(hardlinkResult.stderr, /must not contain hard-linked files/);

    const unreadableResult = spawnSync(
      "bash",
      [scriptPath, "--add-dir", unreadable, "job-name", handoffFile],
      { encoding: "utf8", env },
    );
    assert.equal(unreadableResult.status, 65);
    assert.match(
      unreadableResult.stderr,
      /cannot validate mount boundaries|cannot fully validate|must not contain symlinks/,
    );
  } finally {
    fs.chmodSync(path.join(unreadable, "hidden"), 0o700);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("forwards one validated disposable child exactly once at the launch boundary", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-handoff-launch-"));
  const repository = path.join(sandbox, "repository");
  const worktree = path.join(sandbox, "worktree");
  const disposableRoot = path.join(sandbox, "disposable-inputs");
  const inputCopy = path.join(disposableRoot, "research-copy");
  const fakeBin = path.join(sandbox, "bin");
  const capture = path.join(sandbox, "claude.args");
  try {
    fs.mkdirSync(repository);
    fs.mkdirSync(path.join(repository, ".krn", "runs"), { recursive: true });
    fs.writeFileSync(path.join(repository, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
    fs.writeFileSync(path.join(repository, "README.md"), "handoff fixture\n");
    for (const [command, args] of [
      ["git", ["init", "-q"]],
      ["git", ["config", "user.name", "Handoff Test"]],
      ["git", ["config", "user.email", "handoff@example.invalid"]],
      ["git", ["add", "README.md", ".krn/runs/.gitignore"]],
      ["git", ["commit", "-qm", "handoff fixture"]],
    ]) {
      const result = spawnSync(command, args, { cwd: repository, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }

    const prepared = spawnSync(
      process.execPath,
      [preparePath, "launch-proof", "rewrite"],
      { cwd: repository, encoding: "utf8" },
    );
    assert.equal(prepared.status, 0, prepared.stderr);
    const handoffFile = path.join(prepared.stdout.trim(), "handoff.md");
    fs.writeFileSync(handoffFile, handoff("rewrite"));
    const linked = spawnSync(
      "git",
      ["worktree", "add", "-q", "-b", "handoff-launch-test", worktree],
      { cwd: repository, encoding: "utf8" },
    );
    assert.equal(linked.status, 0, linked.stderr);

    fs.mkdirSync(inputCopy, { recursive: true });
    fs.chmodSync(disposableRoot, 0o700);
    fs.writeFileSync(path.join(inputCopy, "source.txt"), "disposable evidence\n");
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(
      path.join(fakeBin, "node"),
      `#!/usr/bin/env bash\nif [[ "\${1:-}" == */check-claude-window.mjs ]]; then exit 0; fi\nexec "${process.execPath}" "$@"\n`,
      { mode: 0o700 },
    );
    fs.writeFileSync(
      path.join(fakeBin, "claude"),
      "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$HANDOFF_CAPTURE\"\n",
      { mode: 0o700 },
    );

    const launched = spawnSync(
      "bash",
      [
        scriptPath,
        "--accept-edits",
        "--add-dir",
        inputCopy,
        "launch proof",
        handoffFile,
      ],
      {
        cwd: worktree,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
          HANDOFF_CAPTURE: capture,
          SECOND_OPINION_CONTEXT_ROOT: repository,
          SECOND_OPINION_DISPOSABLE_ROOT: disposableRoot,
        },
      },
    );
    assert.equal(launched.status, 0, launched.stderr);
    const args = fs.readFileSync(capture, "utf8").split("\n");
    assert.equal(args.filter((value) => value === inputCopy).length, 1);
    assert.equal(args[args.indexOf("--add-dir") + 1], inputCopy);
    assert.equal(args[args.indexOf("--permission-mode") + 1], "acceptEdits");
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: worktree,
      encoding: "utf8",
    });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
