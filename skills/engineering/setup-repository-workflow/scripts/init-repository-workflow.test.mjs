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
  apply(root);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Methodology/);
  assert.match(agents, /global skills/);
  assert.match(agents, /krn-agent-workflow:start/);
  assert.equal(realpathSync(join(root, "CLAUDE.md")), realpathSync(join(root, "AGENTS.md")));
  assert.doesNotMatch(agents, /bd prime|BEADS INTEGRATION|Never stop before pushing/i);
});

test("apply preserves user prose and is byte-idempotent", () => {
  const root = fixture();
  apply(root);
  const paths = ["AGENTS.md", "docs/agents/issue-tracker.md", "docs/agents/domain.md", "docs/agents/delivery.md", "docs/agents/artifacts.md", "docs/agents/artifact-paths.json", "docs/agents/review.md", "docs/agents/runs/.gitignore"];
  const first = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  apply(root);
  const second = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  assert.deepEqual(second, first);
  assert.match(second["AGENTS.md"], /Keep this user-owned text/);
  assert.equal((second["AGENTS.md"].match(/krn-agent-workflow:start/g) ?? []).length, 1);
  assert.match(second["docs/agents/issue-tracker.md"], /Keep exactly one implementation bead/);
  assert.doesNotMatch(second["docs/agents/issue-tracker.md"], /different WIP|unless this repository/);
});

test("apply preserves repository artifact path extensions and remains idempotent", () => {
  const root = fixture();
  apply(root);
  const pathsFile = join(root, "docs", "agents", "artifact-paths.json");
  const paths = JSON.parse(readFileSync(pathsFile, "utf8"));
  assert.equal(paths.discovery, "docs/discovery");
  assert.equal(paths.capabilities, "docs/capabilities");
  paths.discovery = "docs/custom-discovery";
  paths.capabilities = "docs/custom-capabilities";
  writeFileSync(pathsFile, `${JSON.stringify(paths, null, 2)}\n`);

  apply(root);
  const first = readFileSync(pathsFile, "utf8");
  const firstPaths = JSON.parse(first);
  assert.equal(firstPaths.discovery, "docs/custom-discovery");
  assert.equal(firstPaths.capabilities, "docs/custom-capabilities");
  assert.equal(firstPaths.working_runs, "docs/agents/runs");

  apply(root);
  assert.equal(readFileSync(pathsFile, "utf8"), first);
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

test("apply rejects an unowned adapter before changing instructions", () => {
  const root = fixture();
  mkdirSync(join(root, "docs", "agents"), { recursive: true });
  writeFileSync(join(root, "docs", "agents", "domain.md"), "USER OWNED\n");
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unowned adapter collision/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(join(root, "docs", "agents", "delivery.md")), false);
});

test("apply rejects JSON with only a quoted ownership marker", () => {
  const root = fixture();
  mkdirSync(join(root, "docs", "agents"), { recursive: true });
  writeFileSync(
    join(root, "docs", "agents", "artifact-paths.json"),
    `${JSON.stringify({ schema_version: 1, note: '"_generated_by": "setup-repository-workflow"' })}\n`,
  );
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unowned adapter collision/);
});

test("apply rejects adapter symlink escape before changing instructions", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "krn-repo-setup-outside-"));
  mkdirSync(join(root, "docs"));
  symlinkSync(outside, join(root, "docs", "agents"));
  const before = readFileSync(join(root, "AGENTS.md"), "utf8");
  const result = spawnSync(process.execPath, [script, "apply", "--root", root, "--tracker", "beads", "--domain", "single", "--delivery", "local"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /crosses symlink/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(join(outside, "domain.md")), false);
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

test("apply can reconfigure initializer-owned adapters", () => {
  const root = fixture();
  apply(root);
  execFileSync(process.execPath, [script, "apply", "--root", root, "--tracker", "github", "--domain", "multi", "--delivery", "local"], { encoding: "utf8" });
  assert.match(readFileSync(join(root, "docs", "agents", "issue-tracker.md"), "utf8"), /Issue tracker: GitHub/);
  assert.match(readFileSync(join(root, "docs", "agents", "domain.md"), "utf8"), /CONTEXT-MAP/);
  assert.match(readFileSync(join(root, "docs", "agents", "delivery.md"), "utf8"), /Delivery profile: local/);
  assert.equal((readFileSync(join(root, "AGENTS.md"), "utf8").match(/krn-agent-workflow:start/g) ?? []).length, 1);
});
