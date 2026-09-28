import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

// Agents reach for `--help` after any command; every form must print the usage
// on stdout and exit 0 instead of failing on an undefined option.
test("task help names the explicit legacy queue migration with its archive and owner", () => {
  const result = run(["task", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /krn task store migrate --root DIR \[--yes --archive FILE --actor NAME --reason TEXT\]/);
  assert.match(result.stdout, /krn task store copy --root SOURCE --to ISOLATED-CLONE/);
  assert.match(result.stdout, /krn task store export --root DIR/);
  assert.match(result.stdout, /krn task store restore --root DIR --file ARCHIVE\.json/);
});

test("task help advertises its existing list and reopen commands without legacy reconciliation", () => {
  const result = run(["task", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /krn task <[^>]*\blist\b[^>]*\breopen\b/,
    "the task command list must include its supported public list and reopen verbs");
  assert.doesNotMatch(result.stdout, /krn task <[^>]*\breconcile\b/,
    "the task name must not advertise the legacy Markdown reconciliation path");
});

test("retired ticket command refuses with a public task migration hint even with --help", () => {
  for (const args of [["ticket"], ["ticket", "--help"], ["ticket", "next", "--root", ".", "--json"]]) {
    const result = run(args);
    assert.equal(result.status, 64, `krn ${args.join(" ")} must be a refusal`);
    assert.match(result.stderr, /krn ticket retired; use krn task/);
    assert.equal(result.stdout, "", "retired ticket cannot return a queue or help text");
  }
});

test("help is answered on stdout with exit 0 in every position", () => {
  const forms = [
    ["--help"],
    ["-h"],
    ["help"],
    ["repo", "--help"],
    ["repo", "apply", "--help"],
    ["install", "--help"],
    ["state", "--help"],
    ["changes", "--help"],
    ["harness", "--help"],
  ];
  for (const args of forms) {
    const result = run(args);
    assert.equal(result.status, 0, `krn ${args.join(" ")} must exit 0, got ${result.status}: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/, `krn ${args.join(" ")} must print the usage on stdout`);
    assert.equal(result.stderr, "", `krn ${args.join(" ")} must not write to stderr`);
    assert.doesNotMatch(result.stdout, /krn ticket/, "public help advertises only krn task");
  }
});
