import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// The live surfaces sh-52 owns. The observer is the scanner, not a scan target,
// and the historical research rows stay verbatim outside this list.
const LIVE_SURFACES = [
  "README.md",
  "CONTEXT.md",
  "AGENTS.md",
  "config/AGENTS.md",
  "docs/capabilities.md",
  "docs/migration.md",
  "package.json",
  ".github/workflows/validate.yml",
  "scripts/install.sh",
  "scripts/krn.mjs",
  "scripts/lib/state/state-brief.mjs",
  "scripts/lib/lessons/lessons.mjs",
  "scripts/hooks/krn_memory.py",
  "config/opencode/plugins/krn.js",
  "test/ci-workflow.test.mjs",
  "test/ci-workflow-tiers.test.mjs",
  "test/repro/determinism.test.mjs",
];

// The residual `krn-codex` spellings the contract deliberately keeps: the
// repository slug, the catalog compatibility alias, the frozen shim path
// (including its base-ref conformance copy), and the retired managed link name
// the migration note documents. A shim path reached through `node <path>` is a
// candidate invocation, not a frozen path-only reference, so it stays flagged.
const ALLOWED = [
  /krn-codex-skills/g,
  /krn-codex-catalog/g,
  /\/tmp\/krn-conformance\/scripts\/krn-codex\.mjs/g,
  /(?<!node )\/?(?:[\w.-]+\/)*scripts\/krn-codex\.mjs/g,
  /\bbin\/krn-codex\b/g,
];

const unflagged = (text) => ALLOWED.reduce((carry, pattern) => carry.replace(pattern, ""), text);

test("the live surfaces carry no unflagged krn-codex reference", () => {
  for (const file of LIVE_SURFACES) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
    const leftover = unflagged(read(file));
    assert.doesNotMatch(leftover, /krn-codex/, `${file} still names krn-codex`);
  }
});

test("the npm candidate scripts run scripts/krn.mjs", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  for (const name of ["skills:check", "lessons:check", "lessons:verify", "changes:check", "changes:push"]) {
    assert.match(scripts[name] ?? "", /scripts\/krn\.mjs/, `${name} must run scripts/krn.mjs`);
    assert.doesNotMatch(scripts[name] ?? "", /scripts\/krn-codex\.mjs/, `${name} must not run the frozen shim`);
  }
});

test("the CI runs the approved base evaluator for the frozen case list and the candidate CLI elsewhere", () => {
  const workflow = read(".github/workflows/validate.yml");
  assert.match(workflow, /node scripts\/krn\.mjs changes check/, "the candidate changes check must run scripts/krn.mjs");
  assert.match(workflow, /node scripts\/krn\.mjs conformance check --root \. --frozen/, "the no-base bootstrap must run scripts/krn.mjs");
  assert.match(workflow, /node \/tmp\/krn-conformance\/scripts\/krn\.mjs conformance check --root \/tmp\/krn-conformance --candidate "\$PWD" --frozen/, "the frozen run must apply the base case list with the approved base evaluator");
  assert.doesNotMatch(workflow, /node scripts\/krn-codex\.mjs/, "no CI step may run the frozen shim");
  assert.doesNotMatch(workflow, /\/tmp\/krn-conformance\/scripts\/krn-codex\.mjs/, "the base worktree must run the canonical entrypoint, never the frozen shim");
});

test("the install shim execs krn.mjs", () => {
  const shim = read("scripts/install.sh");
  assert.match(shim, /exec node "\$script_dir\/krn\.mjs" install check/);
  assert.match(shim, /exec node "\$script_dir\/krn\.mjs" install apply/);
  assert.doesNotMatch(shim, /krn-codex/);
});
