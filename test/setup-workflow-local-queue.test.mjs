import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs", import.meta.url));
const krn = fileURLToPath(new URL("../scripts/krn.mjs", import.meta.url));

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

test("local setup selects one Git-ref queue that krn task can use and does not create a Markdown store", () => {
  withRepo((root) => {
    const first = apply(root, "local");
    assert.equal(first.status, 0, first.output);
    const check = spawnSync(process.execPath, [krn, "task", "check", "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr);
    assert.deepEqual(JSON.parse(check.stdout).errors, []);
    assert.equal(existsSync(join(root, ".krn", "tickets")), false, "new setup must not leave a second Markdown queue");
    const added = spawnSync(process.execPath, [krn, "task", "add", "--root", root, "--title", "New local work", "--json"], { encoding: "utf8" });
    assert.equal(added.status, 0, added.stderr);
    const id = JSON.parse(added.stdout).id;
    const initialRef = execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim();
    const repeated = apply(root, "local");
    assert.equal(repeated.status, 0, repeated.output);
    assert.equal(execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }).trim(), initialRef,
      "re-applying setup must not overwrite new tasks");
    const listed = spawnSync(process.execPath, [krn, "task", "list", "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(JSON.parse(listed.stdout).map((task) => task.id), [id]);
    const inspected = spawnSync(process.execPath, [cli, "inspect", "--root", root], { encoding: "utf8" });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).trackerSignals.gitRef, true);
  });
});

test("selected Git-ref setup refuses later legacy Markdown material without changing either source", () => {
  withRepo((root) => {
    assert.equal(apply(root, "local").status, 0);
    const created = spawnSync(process.execPath, [krn, "task", "add", "--root", root, "--id", "selected-only", "--title", "Selected task", "--json"], { encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const queue = execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" });
    const instructions = readFileSync(join(root, "AGENTS.md"));
    const legacy = join(root, ".krn", "tickets", "foreign.md");
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    writeFileSync(legacy, "# different task source\n");
    const result = apply(root, "local");
    assert.equal(result.status, 64, "selected queue must not coexist silently with foreign legacy material");
    assert.match(result.output, /selected Git-ref queue.*legacy Markdown material/);
    assert.equal(execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }), queue);
    assert.deepEqual(readFileSync(join(root, "AGENTS.md")), instructions);
    assert.equal(readFileSync(legacy, "utf8"), "# different task source\n");
    const shown = spawnSync(process.execPath, [krn, "task", "show", "--root", root, "--id", "selected-only", "--json"], { encoding: "utf8" });
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(JSON.parse(shown.stdout).Status, "open");
  });
});

test("local setup refuses a pre-existing Markdown queue without importing or editing it", () => {
  withRepo((root) => {
    const tickets = join(root, ".krn", "tickets");
    mkdirSync(tickets, { recursive: true });
    const file = join(tickets, "operator-task.md");
    writeFileSync(file, "# operator work must survive\n");
    const before = readFileSync(join(root, "AGENTS.md"));
    const result = apply(root, "local");
    assert.notEqual(result.status, 0, "an existing queue needs an explicit reviewed migration");
    assert.match(result.output, /explicit.*migrat/i);
    assert.deepEqual(readFileSync(file), Buffer.from("# operator work must survive\n"));
    assert.deepEqual(readFileSync(join(root, "AGENTS.md")), before);
    assert.notEqual(spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", "refs/krn/queue-active"]).status, 0);
  });
});

// "ticket queue" is the work-item concept here, not a second Markdown store.
test("local tracker scaffolds the ticket queue, names the ABI, and git-excludes it", () => {
  withRepo((root) => {
    const result = apply(root, "local");
    assert.equal(result.status, 0, result.output);
    const archive = join(root, ".krn", "migrations", "setup-empty.json");
    assert.ok(existsSync(archive), "the queue owner retains its initialization receipt");
    assert.equal(spawnSync("git", ["-C", root, "check-ignore", "-q", archive]).status, 0, "the receipt is private host state");
    assert.ok(excludeLines(root).includes(".krn/migrations/"));
    const created = spawnSync(process.execPath, [krn, "task", "add", "--root", root, "--title", "ABI readback", "--json"], { encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const id = JSON.parse(created.stdout).id;
    const fields = spawnSync(process.execPath, [krn, "task", "fields", "--root", root, "--id", id, "--json"], { encoding: "utf8" });
    assert.equal(fields.status, 0, fields.stderr);
    assert.equal(JSON.parse(fields.stdout).Id, id);
    assert.equal(JSON.parse(fields.stdout).Status, "open");
  });
});

test("local setup retains an excluded migration receipt and advertises only selected task commands", () => {
  withRepo((root) => {
    const result = apply(root, "local");
    assert.equal(result.status, 0, result.output);
    const archive = join(root, ".krn", "migrations", "setup-empty.json");
    assert.deepEqual(JSON.parse(readFileSync(archive, "utf8")).entries, [], "setup archives no pre-existing tasks");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(agents, /\*\*Tracker:\*\*[^\n]*selected local Git-ref queue/);
    assert.match(agents, /\*\*Tracker:\*\*[^\n]*krn task check --root \./);
    assert.doesNotMatch(agents, /krn ticket/);
  });
});

test("local apply is idempotent and preserves a foreign .scratch", () => {
  withRepo((root) => {
    mkdirSync(join(root, ".scratch"), { recursive: true });
    writeFileSync(join(root, ".scratch", "operator-note.txt"), "keep me\n");
    assert.equal(apply(root, "local").status, 0);
    const archive = join(root, ".krn", "migrations", "setup-empty.json");
    const original = readFileSync(archive);
    const queue = execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" });
    assert.equal(apply(root, "local").status, 0);
    assert.deepEqual(readFileSync(archive), original, "re-apply does not replace the proof receipt");
    assert.equal(execFileSync("git", ["-C", root, "rev-parse", "refs/krn/queue"], { encoding: "utf8" }), queue);
    assert.equal(readFileSync(join(root, ".scratch", "operator-note.txt"), "utf8"), "keep me\n", "foreign content survives");
    assert.equal(excludeLines(root).filter((line) => line === ".krn/migrations/").length, 1, "the exclude entry is not duplicated");
  });
});

test("local apply preserves a foreign queue README", () => {
  withRepo((root) => {
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    const readme = join(root, ".krn", "tickets", "README.md");
    writeFileSync(readme, "# operator queue\n");
    const result = apply(root, "local");
    assert.equal(result.status, 64, result.output);
    assert.equal(readFileSync(readme, "utf8"), "# operator queue\n");
    assert.notEqual(spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", "refs/krn/queue-active"]).status, 0);
  });
});

test("local apply preserves a foreign queue README by refusing implicit import", () => {
  withRepo((root) => {
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    writeFileSync(join(root, ".krn", "tickets", "README.md"), "# operator queue\n");
    const original = readFileSync(join(root, "AGENTS.md"));
    const result = apply(root, "local");
    assert.equal(result.status, 64, result.output);
    assert.match(result.output, /existing Markdown tasks require explicit reviewed migration/);
    assert.deepEqual(readFileSync(join(root, "AGENTS.md")), original, "refusal must precede instruction writes");
    assert.equal(existsSync(join(root, ".krn", "migrations", "setup-empty.json")), false);
  });
});

test("none keeps the queue scaffolding-free", () => {
  withRepo((root) => {
    assert.equal(apply(root, "none").status, 0);
    assert.ok(!existsSync(join(root, ".krn", "tickets")), "no Markdown queue is created");
    assert.ok(!existsSync(join(root, ".krn", "migrations")), "no selected queue is initialized");
    assert.ok(!excludeLines(root).includes(".krn/migrations/"), "no queue exclude entry is added");
  });
});
