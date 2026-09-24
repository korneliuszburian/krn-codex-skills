import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs", import.meta.url));

function withRepo(body) {
  const root = mkdtempSync(join(tmpdir(), "krn-local-queue-"));
  try {
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    writeFileSync(join(root, "AGENTS.md"), "# Repo\n");
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function apply(root, tracker) {
  const result = spawnSync(
    process.execPath,
    [cli, "apply", "--root", root, "--tracker", tracker, "--domain", "single", "--delivery", "local"],
    { encoding: "utf8" },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function excludeLines(root) {
  const file = join(root, ".git", "info", "exclude");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

test("local tracker scaffolds the ticket queue, names the ABI, and git-excludes it", () => {
  withRepo((root) => {
    const result = apply(root, "local");
    assert.equal(result.status, 0, result.output);
    assert.ok(existsSync(join(root, ".krn", "tickets")), "the queue directory is scaffolded under KRN state");
    const readme = readFileSync(join(root, ".krn", "tickets", "README.md"), "utf8");
    assert.match(readme, /<krn-ticket>/, "the README names the ticket ABI envelope");
    assert.match(readme, /Id:.*Status:/s, "the README names the ABI fields");
    for (const verb of ["check", "next", "claim", "close", "fail"]) {
      assert.match(readme, new RegExp(`krn ticket ${verb}\\b`), `the README names krn ticket ${verb}`);
    }
    assert.ok(excludeLines(root).includes(".krn/tickets/"), "the queue is git-excluded");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(agents, /\*\*Tracker:\*\*[^\n]*\.krn\/tickets\//, "the managed tracker line names the queue");
    assert.match(agents, /\*\*Tracker:\*\*[^\n]*krn ticket (?:check|next|claim|close|fail)/, "the managed tracker line names the queue verbs");
  });
});

test("local apply is idempotent and preserves a foreign .scratch", () => {
  withRepo((root) => {
    mkdirSync(join(root, ".scratch"), { recursive: true });
    writeFileSync(join(root, ".scratch", "operator-note.txt"), "keep me\n");
    assert.equal(apply(root, "local").status, 0);
    const readme = readFileSync(join(root, ".krn", "tickets", "README.md"), "utf8");
    assert.equal(apply(root, "local").status, 0);
    assert.equal(readFileSync(join(root, ".krn", "tickets", "README.md"), "utf8"), readme, "re-apply is byte-identical");
    assert.equal(readFileSync(join(root, ".scratch", "operator-note.txt"), "utf8"), "keep me\n", "foreign content survives");
    assert.equal(excludeLines(root).filter((line) => line === ".krn/tickets/").length, 1, "the exclude entry is not duplicated");
  });
});

test("local apply preserves a foreign queue README", () => {
  withRepo((root) => {
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    writeFileSync(join(root, ".krn", "tickets", "README.md"), "# operator queue\n");
    assert.equal(apply(root, "local").status, 0);
    assert.equal(readFileSync(join(root, ".krn", "tickets", "README.md"), "utf8"), "# operator queue\n");
  });
});

test("none keeps the queue scaffolding-free", () => {
  withRepo((root) => {
    assert.equal(apply(root, "none").status, 0);
    assert.ok(!existsSync(join(root, ".krn", "tickets")), "no queue directory is created");
    assert.ok(!excludeLines(root).includes(".krn/tickets/"), "no queue exclude entry is added");
  });
});
