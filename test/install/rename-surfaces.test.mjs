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
  "docs/research/frontend-delivery.md",
  "package.json",
  ".github/workflows/validate.yml",
  "scripts/install.sh",
  "test/ci-workflow.test.mjs",
  "test/ci-workflow-tiers.test.mjs",
  "test/repro/determinism.test.mjs",
];

// The residual `krn-codex` spellings the contract deliberately keeps: the
// repository slug, the catalog compatibility alias, the package.json alias bin
// key, and the frozen shim path (including its base-ref conformance copy). A
// shim path reached through `node <path>` is a candidate invocation, not a
// frozen path-only reference, so it stays flagged.
const ALLOWED = [
  /krn-codex-skills/g,
  /krn-codex-catalog/g,
  /"krn-codex"/g,
  /\/tmp\/krn-conformance\/scripts\/krn-codex\.mjs/g,
  /(?<!node )\/?(?:[\w.-]+\/)*scripts\/krn-codex\.mjs/g,
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

test("the CI candidate steps run scripts/krn.mjs while the base-ref run keeps the shim", () => {
  const workflow = read(".github/workflows/validate.yml");
  assert.match(workflow, /node scripts\/krn\.mjs changes check/, "the candidate changes check must run scripts/krn.mjs");
  assert.match(workflow, /node scripts\/krn\.mjs conformance check --root \. --frozen/, "the candidate conformance run must run scripts/krn.mjs");
  assert.doesNotMatch(workflow, /node scripts\/krn-codex\.mjs/, "no candidate step may run the frozen shim");
  assert.match(workflow, /\/tmp\/krn-conformance\/scripts\/krn-codex\.mjs/, "the frozen base-ref run keeps the shim alive");
});

test("the install shim execs krn.mjs", () => {
  const shim = read("scripts/install.sh");
  assert.match(shim, /exec node "\$script_dir\/krn\.mjs" install check/);
  assert.match(shim, /exec node "\$script_dir\/krn\.mjs" install apply/);
  assert.doesNotMatch(shim, /krn-codex/);
});

test("the alias and repository exceptions survive the rename", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.bin["krn-codex"], "scripts/krn-codex.mjs");
  assert.equal(pkg.bin["krn-codex-catalog"], "scripts/krn-codex-catalog.mjs");
  assert.match(pkg.repository.url, /github\.com\/korneliuszburian\/krn-codex-skills/);
  assert.match(read("README.md"), /github\.com\/korneliuszburian\/krn-codex-skills/);
  assert.match(read("docs/migration.md"), /scripts\/krn-codex\.mjs/);
  assert.match(read("docs/capabilities.md"), /krn-codex-catalog/);
});

test("the historical research rows keep the old name verbatim", () => {
  const labTests = read("docs/research/lab-tests.md");
  assert.match(labTests, /`scripts\/krn-codex\.mjs` is a re-export shim that keeps every path-only caller working/);
  assert.match(labTests, /text and docs still say `krn-codex` until sh-51\/sh-52 land/);
});
