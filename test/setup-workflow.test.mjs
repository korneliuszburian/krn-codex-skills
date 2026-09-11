import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs", import.meta.url));
const START = "<!-- krn-agent-workflow:start -->";
const END = "<!-- krn-agent-workflow:end -->";

const withRoot = (agents, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-setup-"));
  try {
    if (agents !== undefined) writeFileSync(join(root, "AGENTS.md"), agents);
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const run = (root, args) => {
  const result = spawnSync(process.execPath, [cli, ...args, "--root", root], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const apply = (root, extra = []) => run(root, ["apply", "--tracker", "none", "--domain", "single", "--delivery", "local", ...extra]);

const krnCodex = fileURLToPath(new URL("../scripts/krn-codex.mjs", import.meta.url));

test("setup scaffolds a repository memory page and preserves an existing one", () => {
  withRoot("# Repo\n", (root) => {
    const first = apply(root);
    assert.equal(first.status, 0, first.output);
    const page = join(root, "docs", "research", "workflow-lessons.md");
    assert.ok(existsSync(page), "the memory page is scaffolded");
    const check = spawnSync(process.execPath, [krnCodex, "lessons", "check", "--root", root, "--json"], { encoding: "utf8" });
    const report = JSON.parse(check.stdout);
    assert.equal(report.skipped, undefined, "the scaffolded page is adopted memory");
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
    const original = readFileSync(page, "utf8");
    assert.equal(apply(root).status, 0);
    assert.equal(readFileSync(page, "utf8"), original, "re-apply is idempotent");
    writeFileSync(page, "# custom lessons\n");
    assert.equal(apply(root).status, 0);
    assert.equal(readFileSync(page, "utf8"), "# custom lessons\n", "an existing page is preserved");
  });
});

test("setup rejects bad arguments and enums with usage exit", () => {
  withRoot("# Repo\n", (root) => {
    assert.equal(run(root, ["apply", "stray"]).status, 64);
    assert.match(run(root, ["apply", "--tracker"]).output, /missing value for --tracker/);
    assert.equal(run(root, ["bogus"]).status, 64);
    assert.match(run(root, ["bogus"]).output, /command must be inspect or apply/);
    assert.match(run(root, ["apply", "--tracker", "nope", "--domain", "single", "--delivery", "local"]).output, /--tracker must be/);
    assert.match(run(root, ["apply", "--tracker", "none", "--domain", "nope", "--delivery", "local"]).output, /--domain must be/);
    assert.match(run(root, ["apply", "--tracker", "none", "--domain", "single", "--delivery", "nope"]).output, /--delivery must be/);
    assert.match(apply(root, ["--instruction", "CLAUDE.md"]).output, /--instruction must be AGENTS.md/);
  });
});

test("setup rejects malformed managed markers", () => {
  withRoot(`# Repo\n\n${START}\n`, (root) => {
    assert.match(apply(root).output, /incomplete managed block/);
  });
  withRoot(`# Repo\n\n${END}\nbody\n${START}\n`, (root) => {
    assert.match(apply(root).output, /reversed managed block markers/);
  });
  withRoot(`# Repo\n\n${START}\na\n${END}\n${START}\nb\n${END}\n`, (root) => {
    assert.match(apply(root).output, /duplicate managed blocks/);
  });
});

test("setup refuses a foreign managed-file collision", () => {
  withRoot("# Repo\n", (root) => {
    mkdirSync(join(root, ".krn", "runs"), { recursive: true });
    writeFileSync(join(root, ".krn", "runs", ".gitignore"), "operator-owned\n");
    const result = apply(root);
    assert.equal(result.status, 64);
    assert.match(result.output, /unowned managed file collision/);
  });
});
