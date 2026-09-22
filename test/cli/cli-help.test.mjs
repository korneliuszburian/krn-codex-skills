import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

// Agents reach for `--help` after any command; every form must print the usage
// on stdout and exit 0 instead of failing on an undefined option.
test("help is answered on stdout with exit 0 in every position", () => {
  const forms = [
    ["--help"],
    ["-h"],
    ["help"],
    ["repo", "--help"],
    ["repo", "apply", "--help"],
    ["ticket", "--help"],
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
  }
});
