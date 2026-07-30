import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./init-repository-workflow.mjs", import.meta.url).pathname;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "krn-repo-setup-"));
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, "AGENTS.md"), "# Product contract\n\nKeep this user-owned text.\n");
  return root;
}

function apply(root, extra = []) {
  return execFileSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "strict", ...extra], { encoding: "utf8" });
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
  assert.match(second["AGENTS.md"], /bd list --parent <map> --ready/);
  assert.match(second["AGENTS.md"], /bd show <id> --json/);
  assert.match(second["AGENTS.md"], /complete Wayfinder adapter/);
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
  const root = fixture();
  apply(root);
  execFileSync(process.execPath, [script, "apply", "--root", root, "--tracker", "github", "--domain", "multi", "--delivery", "local"], { encoding: "utf8" });
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /GitHub issues own durable task state/);
  assert.match(agents, /not a complete Wayfinder adapter/);
  assert.match(agents, /root `CONTEXT\.md` as the compact index/);
  assert.doesNotMatch(agents, /CONTEXT-MAP\.md/);
  assert.match(agents, /Branch, PR, CI, merge, and deployment follow explicit/);
  assert.equal((agents.match(/krn-agent-workflow:start/g) ?? []).length, 1);
  assert.equal(existsSync(join(root, "docs", "agents")), false);
});
