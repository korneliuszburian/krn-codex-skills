import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./init-repository-workflow.mjs", import.meta.url).pathname;
const bdProbe = spawnSync("bd", ["--version"], { encoding: "utf8" });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-"));
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, "AGENTS.md"), "# Product contract\n\nKeep this user-owned text.\n");
  return root;
}

function apply(root, extra = []) {
  return execFileSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "strict", ...extra], { encoding: "utf8" });
}

function localConfigEntries(root) {
  return execFileSync(
    "git",
    ["-C", root, "config", "--local", "--null", "--list"],
    { encoding: "utf8" },
  ).split("\0").filter(Boolean).map((entry) => {
    const separator = entry.indexOf("\n");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  });
}

function directorySnapshot(root) {
  return Object.fromEntries(readdirSync(root).sort().map((name) => {
    const path = join(root, name);
    const metadata = statSync(path);
    return [name, {
      mode: metadata.mode,
      contents: readFileSync(path).toString("base64"),
    }];
  }));
}

test("apply bootstraps a thin AGENTS.md and CLAUDE.md symlink when none exists", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-empty-"));
  execFileSync("git", ["init", "-q", root]);
  const result = JSON.parse(apply(root));
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Methodology/);
  assert.match(agents, /global skills/);
  assert.match(agents, /krn-agent-workflow:start/);
  assert.equal(realpathSync(join(root, "CLAUDE.md")), realpathSync(join(root, "AGENTS.md")));
  assert.doesNotMatch(agents, /bd prime|BEADS INTEGRATION|Never stop before pushing/i);
  assert.deepEqual(
    [...result.written].sort(),
    [".krn/runs/.gitignore", "AGENTS.md", "CLAUDE.md"],
  );
  const changed = execFileSync(
    "git",
    ["-C", root, "status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
  assert.deepEqual(changed, [...result.written].sort());
});

test("bootstrap fails closed on an occupied CLAUDE.md destination", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-bootstrap-collision-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "CLAUDE.md"));
  const result = spawnSync(
    process.execPath,
    [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "strict"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 64);
  assert.match(result.stderr, /instruction bootstrap destination is occupied: CLAUDE\.md/);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
  assert.equal(existsSync(join(root, ".krn")), false);
});

test("apply preserves user prose and is byte-idempotent", () => {
  const root = fixture();
  apply(root);
  const paths = ["AGENTS.md", ".krn/runs/.gitignore"];
  const first = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  apply(root);
  const second = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  assert.deepEqual(second, first);
  assert.match(second["AGENTS.md"], /Keep this user-owned text/);
  assert.equal((second["AGENTS.md"].match(/krn-agent-workflow:start/g) ?? []).length, 1);
  assert.match(second["AGENTS.md"], /Beads owns durable task state/);
  assert.match(second["AGENTS.md"], /bd create --title <map-title> --type epic/);
  assert.match(second["AGENTS.md"], /bd create --title <ticket-title> --parent <map>/);
  assert.match(second["AGENTS.md"], /--no-inherit-labels/);
  assert.match(second["AGENTS.md"], /bd list --parent <map> --ready/);
  assert.match(second["AGENTS.md"], /bd show <id> --json/);
  assert.doesNotMatch(second["AGENTS.md"], /complete Wayfinder adapter/);
  assert.match(second["AGENTS.md"], /map body/);
  assert.match(second["AGENTS.md"], /every open child body/);
  assert.match(second["AGENTS.md"], /exact worker-result return channel/);
  assert.match(second["AGENTS.md"], /TRANSFER_PENDING/);
  assert.match(second["AGENTS.md"], /writer generation/);
  assert.match(second["AGENTS.md"], /transfer alone is not consumer completion/);
  assert.match(second["AGENTS.md"], /\.krn\/runs\/<workflow>\/<run-id>/);
});

test("apply leaves domain and documentation artifacts lazy", () => {
  const root = fixture();
  apply(root);
  assert.equal(existsSync(join(root, "docs", "agents")), false);
  assert.equal(existsSync(join(root, "CONTEXT.md")), false);
  assert.equal(existsSync(join(root, "docs", "adr")), false);
  assert.equal(existsSync(join(root, "docs", "research")), false);
});

test("shared CLAUDE symlink keeps AGENTS as one semantic owner", () => {
  const root = fixture();
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  const result = JSON.parse(apply(root));
  assert.equal(result.instruction, "AGENTS.md");
});

test("independent AGENTS and CLAUDE require an explicit owner", () => {
  const root = fixture();
  writeFileSync(join(root, "CLAUDE.md"), "# Separate owner\n");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /select --instruction explicitly/);
});

test("inspect reports repository signals without writing", () => {
  const root = fixture();
  mkdirSync(join(root, ".beads"));
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = JSON.parse(execFileSync(process.execPath, [script, "inspect", "--root", root], { encoding: "utf8" }));
  assert.equal(result.instruction, "AGENTS.md");
  assert.equal(result.trackerSignals.beads, true);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
});

test("apply rejects an unowned managed file before changing instructions", () => {
  const root = fixture();
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "USER OWNED\n");
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unowned managed file collision/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(join(root, "docs", "agents")), false);
});

test("apply does not bootstrap instructions before rejecting an unowned run boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-empty-collision-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "USER OWNED\n");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unowned managed file collision/);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
  assert.equal(existsSync(join(root, "CLAUDE.md")), false);
});

test("apply rejects managed file symlink escape before changing instructions", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "krn-repo-setup-outside-"));
  symlinkSync(outside, join(root, ".krn"));
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /crosses symlink/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(join(outside, "runs")), false);
});

test("apply rejects a dangling managed-file symlink before changing instructions", () => {
  const root = fixture();
  const outside = join(mkdtempSync(join(tmpdir(), "krn-repo-setup-outside-")), "created");
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  symlinkSync(outside, join(root, ".krn", "runs", ".gitignore"));
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /managed file destination is not a regular file/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(outside), false);
});

test("apply rejects a dangling intermediate symlink before changing instructions", () => {
  const root = fixture();
  const outside = join(mkdtempSync(join(tmpdir(), "krn-repo-setup-outside-")), "missing");
  symlinkSync(outside, join(root, ".krn"));
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /managed file path crosses symlink/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(outside), false);
});

test("apply rejects an instruction symlink outside the repository", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-"));
  execFileSync("git", ["init", "-q", root]);
  const outside = join(mkdtempSync(join(tmpdir(), "krn-repo-setup-outside-")), "AGENTS.md");
  writeFileSync(outside, "# Outside\n");
  symlinkSync(outside, join(root, "AGENTS.md"));
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /resolves outside repository/);
  assert.equal(readFileSync(outside, "utf8"), "# Outside\n");
});

test("apply rejects reversed managed markers", () => {
  const root = fixture();
  writeFileSync(join(root, "AGENTS.md"), "<!-- krn-agent-workflow:end -->\ntext\n<!-- krn-agent-workflow:start -->\n");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /reversed managed block markers/);
});

test("apply can reconfigure the compact managed block", () => {
  for (const [tracker, owner] of [
    ["github", /GitHub issues own durable task state/],
    ["gitlab", /GitLab issues own durable task state/],
    ["local", /Local Markdown under `\.scratch\/<map>\/` owns durable task state/],
  ]) {
    const root = fixture();
    apply(root);
    execFileSync(process.execPath, [script, "apply", "--root", root, "--tracker", tracker, "--domain", "multi", "--delivery", "local"], { encoding: "utf8" });
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(agents, owner);
    assert.match(agents, /not a complete Wayfinder adapter/);
    for (const required of [
      /exact map create\/update/,
      /child create\/update/,
      /dependency-edge write/,
      /atomic claim/,
      /resolution write/,
      /frontier query/,
      /close\/readback/,
      /persisted map-integrator identity and tracker-authority state/,
      /writer generation/,
      /`TRANSFER_PENDING` successor identity and return channel/,
      /`ACTIVE` with activation `PENDING`/,
      /matching `VERIFIED` activation/,
      /parent and every open-child readback after each transfer phase/,
      /one exact runtime worker-result return channel/,
    ]) {
      assert.match(agents, required);
    }
    assert.match(agents, /Resolve separate tracker-write authority/);
    assert.match(agents, /root `CONTEXT\.md` as the compact index/);
    assert.doesNotMatch(agents, /CONTEXT-MAP\.md/);
    assert.match(agents, /Branch, PR, CI, merge, and deployment follow explicit/);
    assert.equal((agents.match(/krn-agent-workflow:start/g) ?? []).length, 1);
    assert.equal(existsSync(join(root, "docs", "agents")), false);
  }
});

test("apply records tracker absence without emulating durable operations", () => {
  const root = fixture();
  const result = JSON.parse(execFileSync(
    process.execPath,
    [script, "apply", "--root", root, "--tracker", "none", "--domain", "single", "--delivery", "local"],
    { encoding: "utf8" },
  ));
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  assert.equal(result.tracker, "none");
  assert.match(agents, /No durable tracker is configured/);
  assert.match(agents, /accepted request or native Goal owns current continuation/);
  assert.match(agents, /Shared queue, claims, and durable frontier state are absent/);
  assert.match(agents, /Do not emulate tracker operations or create task\/status files/);
  assert.match(agents, /\$wayfinder.*must stop/);
  assert.doesNotMatch(agents, /Beads owns|GitHub issues own|GitLab issues own|Local Markdown under/);
  assert.doesNotMatch(agents, /bd create|gh issue|glab issue|\.scratch\/<map>/);
  assert.equal(existsSync(join(root, ".beads")), false);
  assert.equal(existsSync(join(root, ".scratch")), false);

  execFileSync(
    process.execPath,
    [script, "apply", "--root", root, "--tracker", "none", "--domain", "single", "--delivery", "local"],
    { encoding: "utf8" },
  );
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), agents);
});

test("installed Beads init stays outside instruction ownership and generated create operations execute", {
  skip: bdProbe.status === 0 ? false : "bd is not installed",
}, () => {
  assert.match(bdProbe.stdout, /^bd version 1\.0\.4\b/);
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-beads-live-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "setup-smoke@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Setup smoke"]);
  execFileSync("git", ["-C", root, "config", "krn.probe", "preserve"]);
  writeFileSync(join(root, "AGENTS.md"), "# Existing product contract\n");
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude", "settings.json"), "{\"existing\":true}\n");
  execFileSync("git", ["-C", root, "add", "AGENTS.md", "CLAUDE.md", ".claude/settings.json"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "baseline"]);
  const commonGitDir = realpathSync(execFileSync(
    "git",
    ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  ).trim());
  const hookPath = realpathSync(execFileSync(
    "git",
    ["-C", root, "rev-parse", "--path-format=absolute", "--git-path", "hooks"],
    { encoding: "utf8" },
  ).trim());
  assert.equal(hookPath, join(commonGitDir, "hooks"));
  writeFileSync(join(hookPath, "pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const before = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const agentsBefore = readFileSync(join(root, "AGENTS.md"), "utf8");
  const claudeBefore = readlinkSync(join(root, "CLAUDE.md"));
  const settingsBefore = readFileSync(join(root, ".claude", "settings.json"), "utf8");
  const hooksBefore = directorySnapshot(hookPath);
  const configBefore = localConfigEntries(root);
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }), "");

  execFileSync("bd", ["init", "--skip-agents", "--skip-hooks", "--non-interactive"], {
    cwd: root,
    encoding: "utf8",
  });
  const initialized = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const initializedPaths = execFileSync(
    "git",
    ["-C", root, "diff", "--name-only", `${before}..${initialized}`],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  if (/\bbd version 1\.0\.4\b/.test(bdProbe.stdout)) {
    assert.notEqual(initialized, before);
  }
  assert.ok(initializedPaths.length > 0);
  assert.ok(initializedPaths.every((path) => path === ".gitignore" || path.startsWith(".beads/")));
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), agentsBefore);
  assert.equal(readlinkSync(join(root, "CLAUDE.md")), claudeBefore);
  assert.equal(readFileSync(join(root, ".claude", "settings.json"), "utf8"), settingsBefore);
  assert.deepEqual(directorySnapshot(hookPath), hooksBefore);
  assert.equal(existsSync(join(root, ".beads", "hooks")), false);
  const configAfter = localConfigEntries(root);
  assert.deepEqual(
    configAfter.filter(([key]) => !key.startsWith("beads.")),
    configBefore,
  );
  assert.deepEqual(
    configAfter.filter(([key]) => key.startsWith("beads.")),
    [["beads.role", "maintainer"]],
  );
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }), "");

  apply(root);
  assert.equal(
    execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    initialized,
  );
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agents, /BEADS INTEGRATION|Never stop before pushing/i);
  assert.match(agents, /bd create --title <map-title>/);
  assert.match(agents, /bd create --title <ticket-title>/);

  writeFileSync(join(root, "map.md"), "# Map\n");
  writeFileSync(join(root, "ticket.md"), "# Ticket\n");
  const mapId = execFileSync(
    "bd",
    ["create", "--title", "Wayfinder map smoke", "--type", "epic", "--labels", "wayfinder:map", "--body-file", "map.md", "--silent"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  const ticketId = execFileSync(
    "bd",
    ["create", "--title", "Wayfinder ticket smoke", "--parent", mapId, "--labels", "wayfinder:research", "--no-inherit-labels", "--body-file", "ticket.md", "--silent"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  const dependentId = execFileSync(
    "bd",
    ["create", "--title", "Wayfinder dependent smoke", "--parent", mapId, "--labels", "wayfinder:task", "--no-inherit-labels", "--body-file", "ticket.md", "--silent"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  execFileSync("bd", ["dep", "add", dependentId, ticketId], { cwd: root, encoding: "utf8" });
  const initialFrontier = JSON.parse(execFileSync(
    "bd",
    ["list", "--parent", mapId, "--ready", "--json"],
    { cwd: root, encoding: "utf8" },
  ));
  assert.deepEqual(initialFrontier.map(({ id }) => id), [ticketId]);

  execFileSync("bd", ["update", ticketId, "--claim"], { cwd: root, encoding: "utf8" });
  execFileSync("bd", ["update", ticketId, "--body-file", "ticket.md"], { cwd: root, encoding: "utf8" });
  assert.equal(
    JSON.parse(execFileSync("bd", ["show", ticketId, "--json"], { cwd: root, encoding: "utf8" }))[0].status,
    "in_progress",
  );
  execFileSync("bd", ["close", ticketId], { cwd: root, encoding: "utf8" });
  const unblockedFrontier = JSON.parse(execFileSync(
    "bd",
    ["list", "--parent", mapId, "--ready", "--json"],
    { cwd: root, encoding: "utf8" },
  ));
  assert.deepEqual(unblockedFrontier.map(({ id }) => id), [dependentId]);
  execFileSync("bd", ["update", dependentId, "--claim"], { cwd: root, encoding: "utf8" });
  execFileSync("bd", ["close", dependentId], { cwd: root, encoding: "utf8" });
  execFileSync("bd", ["update", mapId, "--body-file", "map.md"], { cwd: root, encoding: "utf8" });
  execFileSync("bd", ["close", mapId], { cwd: root, encoding: "utf8" });

  const map = JSON.parse(execFileSync("bd", ["show", mapId, "--json"], { cwd: root, encoding: "utf8" }))[0];
  const ticket = JSON.parse(execFileSync("bd", ["show", ticketId, "--json"], { cwd: root, encoding: "utf8" }))[0];
  const dependent = JSON.parse(execFileSync("bd", ["show", dependentId, "--json"], { cwd: root, encoding: "utf8" }))[0];
  assert.equal(map.title, "Wayfinder map smoke");
  assert.equal(map.status, "closed");
  assert.deepEqual(map.labels, ["wayfinder:map"]);
  assert.equal(ticket.title, "Wayfinder ticket smoke");
  assert.equal(ticket.status, "closed");
  assert.equal(ticket.parent, mapId);
  assert.deepEqual(ticket.labels, ["wayfinder:research"]);
  assert.deepEqual(dependent.labels, ["wayfinder:task"]);
});
